import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db.js", () => ({
  pool: { query: vi.fn() },
}));

import { BrevoQuotaWarningWorker } from "../../src/brevo-quota-warning-worker.js";
import { config } from "../../src/config.js";
import { pool } from "../../src/db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe("Brevo quota warning worker", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("claims warnings only after 4,990 result recipients were accepted", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await new BrevoQuotaWarningWorker({ sendQuotaWarning: vi.fn() }).runOnce();

    const [sql, params] = poolMock.query.mock.calls[0] ?? [];
    expect(String(sql)).toContain("sent.kind='result' AND sent.status='accepted'");
    expect(params?.[1]).toBe(config.brevo.warningThreshold);
  });

  it("persists both Brevo message ids after one private batch request", async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{
        send_id: "warning-1", attempts: 1, billing_cycle_start: "2026-09-11",
        payload_json: { cycleStart: "2026-09-11", cycleEnd: "2026-10-11", threshold: 4990, limit: 5000 },
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const sendQuotaWarning = vi.fn().mockResolvedValue({ messageIds: ["message-1", "message-2"] });

    await new BrevoQuotaWarningWorker({ sendQuotaWarning }).runOnce();

    expect(sendQuotaWarning).toHaveBeenCalledWith(expect.objectContaining({ sendId: "warning-1" }));
    const acceptedUpdate = poolMock.query.mock.calls.find(([sql]) => String(sql).includes("SET status='accepted'"));
    expect(acceptedUpdate?.[1]).toEqual(["warning-1", ["message-1", "message-2"]]);
  });
});
