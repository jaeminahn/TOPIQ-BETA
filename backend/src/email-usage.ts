import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "./config.js";
import { pool } from "./db.js";
import { brevoBillingCycle, type BrevoBillingCycle } from "./email-policy.js";
import { AppError } from "./errors.js";

type Queryable = Pick<PoolClient, "query">;

export type EmailWarningStatus = "not_sent" | "pending" | "accepted" | "failed";

export interface EmailUsageSummary {
  enabled: boolean;
  configured: boolean;
  cycleStart: string;
  cycleEnd: string;
  acceptedCount: number;
  pendingCount: number;
  limit: number;
  remaining: number;
  warningThreshold: number;
  warningStatus: EmailWarningStatus;
}

export class EmailUsageRepository {
  async authorizeResultReservation(client: Queryable, sessionId: string, now = new Date()) {
    const cycle = brevoBillingCycle(now);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('brevo-email-quota'))");
    const settings = await client.query<{ result_email_enabled: boolean }>(
      "SELECT result_email_enabled FROM topik_app.email_settings WHERE settings_id=1 FOR UPDATE",
    );
    if (settings.rows[0]?.result_email_enabled === false) {
      throw new AppError(503, "RESULT_EMAIL_DISABLED", "Result email delivery is disabled");
    }

    const sessionUsage = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int count
         FROM topik_app.email_send_ledger
        WHERE kind='result' AND session_id=$1
          AND status IN ('pending','processing','accepted')
          AND requested_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [sessionId],
    );
    if ((sessionUsage.rows[0]?.count ?? 0) >= config.brevo.sessionHourlyLimit) {
      throw new AppError(429, "RESULT_EMAIL_HOURLY_LIMIT_REACHED", "This session has reached its hourly email limit");
    }

    const usage = await this.activeCycleUsage(client, cycle.start);
    const warning = await client.query(
      `SELECT 1 FROM topik_app.email_send_ledger
        WHERE kind='quota_warning' AND billing_cycle_start=$1
          AND status IN ('pending','processing','accepted') LIMIT 1`,
      [cycle.start],
    );
    const reserveWarning = usage + 1 >= config.brevo.warningThreshold && !warning.rowCount;
    const requiredSlots = 1 + (reserveWarning ? 2 : 0);
    if (usage + requiredSlots > config.brevo.monthlyLimit) {
      throw new AppError(503, "RESULT_EMAIL_MONTHLY_LIMIT_REACHED", "The monthly result email limit has been reached");
    }
    return { cycle, reserveWarning };
  }

  async recordResultReservation(
    client: Queryable,
    input: { deliveryId: string; sessionId: string; cycle: BrevoBillingCycle; reserveWarning: boolean },
  ) {
    await client.query(
      `INSERT INTO topik_app.email_send_ledger(
         send_id,kind,result_delivery_id,session_id,billing_cycle_start,recipient_count
       ) VALUES ($1,'result',$2,$3,$4,1)`,
      [randomUUID(), input.deliveryId, input.sessionId, input.cycle.start],
    );
    if (!input.reserveWarning) return;
    await client.query(
      `INSERT INTO topik_app.email_send_ledger(
         send_id,kind,trigger_delivery_id,billing_cycle_start,recipient_count,payload_json
       ) VALUES ($1,'quota_warning',$2,$3,2,$4)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), input.deliveryId, input.cycle.start, {
        cycleStart: input.cycle.start,
        cycleEnd: input.cycle.endExclusive,
        threshold: config.brevo.warningThreshold,
        limit: config.brevo.monthlyLimit,
      }],
    );
  }

  async markResultAccepted(client: Queryable, deliveryId: string, providerMessageId: string) {
    await client.query(
      `UPDATE topik_app.email_send_ledger
          SET status='accepted',provider_message_ids=ARRAY[$2],accepted_at=CURRENT_TIMESTAMP,
              failure_code=NULL,lease_expires_at=NULL
        WHERE result_delivery_id=$1`,
      [deliveryId, providerMessageId],
    );
    const warning = await client.query(
      `SELECT 1 FROM topik_app.email_send_ledger
        WHERE kind='quota_warning' AND trigger_delivery_id=$1 AND status='pending' LIMIT 1`,
      [deliveryId],
    );
    return Boolean(warning.rowCount);
  }

  async markResultFailed(deliveryId: string, failureCode: string, client: Queryable = pool) {
    await client.query(
      `UPDATE topik_app.email_send_ledger
          SET status='failed',failure_code=$2,failed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL
        WHERE result_delivery_id=$1 AND status IN ('pending','processing')`,
      [deliveryId, failureCode],
    );
    await client.query(
      `UPDATE topik_app.email_send_ledger
          SET status='failed',failure_code='TRIGGER_DELIVERY_FAILED',failed_at=CURRENT_TIMESTAMP,
              lease_expires_at=NULL
        WHERE kind='quota_warning' AND trigger_delivery_id=$1
          AND status IN ('pending','processing')`,
      [deliveryId],
    );
  }

  async getSummary(now = new Date()): Promise<EmailUsageSummary> {
    const cycle = brevoBillingCycle(now);
    const [settings, usage, warning] = await Promise.all([
      pool.query<{ result_email_enabled: boolean }>(
        "SELECT result_email_enabled FROM topik_app.email_settings WHERE settings_id=1",
      ),
      pool.query<{ accepted_count: number; pending_count: number }>(
        `SELECT
           COALESCE(SUM(recipient_count) FILTER (WHERE status='accepted'),0)::int accepted_count,
           COALESCE(SUM(recipient_count) FILTER (WHERE status IN ('pending','processing')),0)::int pending_count
         FROM topik_app.email_send_ledger WHERE billing_cycle_start=$1`,
        [cycle.start],
      ),
      pool.query<{ status: "pending" | "processing" | "accepted" | "failed" }>(
        `SELECT status FROM topik_app.email_send_ledger
          WHERE kind='quota_warning' AND billing_cycle_start=$1
          ORDER BY requested_at DESC LIMIT 1`,
        [cycle.start],
      ),
    ]);
    const acceptedCount = usage.rows[0]?.accepted_count ?? 0;
    const pendingCount = usage.rows[0]?.pending_count ?? 0;
    const warningState = warning.rows[0]?.status;
    return {
      enabled: settings.rows[0]?.result_email_enabled ?? true,
      configured: Boolean(config.brevo.apiKey && config.brevo.senderEmail && config.brevo.alertEmails.length === 2),
      cycleStart: cycle.start,
      cycleEnd: cycle.endExclusive,
      acceptedCount,
      pendingCount,
      limit: config.brevo.monthlyLimit,
      remaining: Math.max(0, config.brevo.monthlyLimit - acceptedCount - pendingCount),
      warningThreshold: config.brevo.warningThreshold,
      warningStatus: warningState === "accepted" ? "accepted"
        : warningState === "pending" || warningState === "processing" ? "pending"
          : warningState === "failed" ? "failed" : "not_sent",
    };
  }

  async setEnabled(adminUserId: string, enabled: boolean) {
    const result = await pool.query<{ result_email_enabled: boolean; updated_at: Date }>(
      `UPDATE topik_app.email_settings
          SET result_email_enabled=$1,updated_by=$2,updated_at=CURRENT_TIMESTAMP
        WHERE settings_id=1
        RETURNING result_email_enabled,updated_at`,
      [enabled, adminUserId],
    );
    return {
      enabled: result.rows[0]?.result_email_enabled ?? enabled,
      updatedAt: result.rows[0]?.updated_at?.toISOString() ?? new Date().toISOString(),
    };
  }

  private async activeCycleUsage(client: Queryable, cycleStart: string) {
    const result = await client.query<{ count: number }>(
      `SELECT COALESCE(SUM(recipient_count),0)::int count
         FROM topik_app.email_send_ledger
        WHERE billing_cycle_start=$1 AND status IN ('pending','processing','accepted')`,
      [cycleStart],
    );
    return result.rows[0]?.count ?? 0;
  }
}

export const emailUsageRepository = new EmailUsageRepository();
