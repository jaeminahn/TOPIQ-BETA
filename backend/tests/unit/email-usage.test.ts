import { describe, expect, it, vi } from "vitest";
import { config } from "../../src/config.js";
import { EmailUsageRepository } from "../../src/email-usage.js";
import { AppError } from "../../src/errors.js";

function clientWith(options: { enabled?: boolean; sessionCount?: number; cycleCount?: number; warningExists?: boolean }) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ result_email_enabled: options.enabled ?? true }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ count: options.sessionCount ?? 0 }], rowCount: 1 });
  if ((options.sessionCount ?? 0) < config.brevo.sessionHourlyLimit && options.enabled !== false) {
    query
      .mockResolvedValueOnce({ rows: [{ count: options.cycleCount ?? 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: options.warningExists ? [{ exists: 1 }] : [], rowCount: options.warningExists ? 1 : 0 });
  }
  return { query };
}

describe("result email usage policy", () => {
  it("allows four sends but rejects the sixth reservation in a rolling hour", async () => {
    const repository = new EmailUsageRepository();
    const allowed = clientWith({ sessionCount: 4 });
    await expect(repository.authorizeResultReservation(allowed as never, "session-1")).resolves.toMatchObject({
      reserveWarning: false,
    });
    expect(String(allowed.query.mock.calls[2]?.[0])).toContain("CURRENT_TIMESTAMP - INTERVAL '1 hour'");

    const limited = clientWith({ sessionCount: 5 });
    try {
      await repository.authorizeResultReservation(limited as never, "session-1");
      throw new Error("Expected the session rate limit to reject the request");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("RESULT_EMAIL_HOURLY_LIMIT_REACHED");
    }
  });

  it("reserves two warning recipients with the result that reaches 4,990", async () => {
    const repository = new EmailUsageRepository();
    const client = clientWith({ cycleCount: config.brevo.warningThreshold - 1 });
    await expect(repository.authorizeResultReservation(client as never, "session-1")).resolves.toMatchObject({
      reserveWarning: true,
    });
  });

  it("blocks new result mail while the admin switch is off or the monthly limit is full", async () => {
    const repository = new EmailUsageRepository();
    for (const [client, code] of [
      [clientWith({ enabled: false }), "RESULT_EMAIL_DISABLED"],
      [clientWith({ cycleCount: config.brevo.monthlyLimit, warningExists: true }), "RESULT_EMAIL_MONTHLY_LIMIT_REACHED"],
    ] as const) {
      await expect(repository.authorizeResultReservation(client as never, "session-1"))
        .rejects.toMatchObject({ code });
    }
  });
});
