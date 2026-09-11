import { BrevoResultEmailSender, type QuotaWarningSender } from "./brevo-result-email.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { brevoBillingCycle } from "./email-policy.js";

type WarningJob = {
  send_id: string;
  attempts: number;
  billing_cycle_start: string;
  payload_json: {
    cycleStart?: string;
    cycleEnd?: string;
    threshold?: number;
    limit?: number;
  };
};

export class BrevoQuotaWarningWorker {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(private readonly sender: QuotaWarningSender = new BrevoResultEmailSender()) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), 15_000);
    this.timer.unref();
    void this.runOnce();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  kick() { void this.runOnce(); }

  private async claim(): Promise<WarningJob | null> {
    const cycle = brevoBillingCycle();
    const result = await pool.query<WarningJob>(
      `WITH candidate AS (
         SELECT ledger.send_id
           FROM topik_app.email_send_ledger ledger
          WHERE ledger.kind='quota_warning'
            AND ledger.billing_cycle_start=$1
            AND (
              (ledger.status='pending' AND ledger.next_attempt_at<=CURRENT_TIMESTAMP)
              OR (ledger.status='processing' AND ledger.lease_expires_at<CURRENT_TIMESTAMP)
            )
            AND (
              ledger.trigger_delivery_id IS NULL
              OR EXISTS (
                SELECT 1 FROM topik_app.result_email_deliveries delivery
                 WHERE delivery.delivery_id=ledger.trigger_delivery_id AND delivery.status='accepted'
              )
            )
            AND (
              SELECT COALESCE(SUM(sent.recipient_count),0)
                FROM topik_app.email_send_ledger sent
               WHERE sent.billing_cycle_start=ledger.billing_cycle_start
                 AND sent.kind='result' AND sent.status='accepted'
            ) >= $2
          ORDER BY ledger.requested_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE topik_app.email_send_ledger ledger
          SET status='processing',attempts=attempts+1,
              lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '2 minutes',failure_code=NULL
         FROM candidate WHERE ledger.send_id=candidate.send_id
       RETURNING ledger.send_id,ledger.attempts,ledger.billing_cycle_start,ledger.payload_json`,
      [cycle.start, config.brevo.warningThreshold],
    );
    return result.rows[0] ?? null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      let job: WarningJob | null;
      while ((job = await this.claim())) await this.process(job);
    } catch (error) {
      console.error("Brevo quota warning worker polling failed", error);
    } finally {
      this.running = false;
    }
  }

  private async process(job: WarningJob) {
    try {
      const fallbackCycle = brevoBillingCycle();
      const sent = await this.sender.sendQuotaWarning({
        sendId: job.send_id,
        cycleStart: job.payload_json.cycleStart ?? job.billing_cycle_start,
        cycleEnd: job.payload_json.cycleEnd ?? fallbackCycle.endExclusive,
        threshold: job.payload_json.threshold ?? config.brevo.warningThreshold,
        limit: job.payload_json.limit ?? config.brevo.monthlyLimit,
      });
      await pool.query(
        `UPDATE topik_app.email_send_ledger
            SET status='accepted',provider_message_ids=$2,accepted_at=CURRENT_TIMESTAMP,
                failed_at=NULL,failure_code=NULL,lease_expires_at=NULL
          WHERE send_id=$1`,
        [job.send_id, sent.messageIds],
      );
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const retryMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      await pool.query(
        `UPDATE topik_app.email_send_ledger
            SET status='pending',failure_code=$2,failed_at=CURRENT_TIMESTAMP,
                next_attempt_at=CURRENT_TIMESTAMP+$3::int*INTERVAL '1 minute',lease_expires_at=NULL
          WHERE send_id=$1`,
        [job.send_id, message, retryMinutes],
      );
    }
  }
}

export const brevoQuotaWarningWorker = new BrevoQuotaWarningWorker();
