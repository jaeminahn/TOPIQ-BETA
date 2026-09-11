import { describe, expect, it } from "vitest";
import { brevoBillingCycle } from "../../src/email/policy.js";

describe("Brevo billing cycle", () => {
  it("rolls over at midnight on the 11th in Asia/Seoul", () => {
    expect(brevoBillingCycle(new Date("2026-10-10T14:59:59.999Z"), "2026-09-11")).toEqual({
      start: "2026-09-11",
      endExclusive: "2026-10-11",
    });
    expect(brevoBillingCycle(new Date("2026-10-10T15:00:00.000Z"), "2026-09-11")).toEqual({
      start: "2026-10-11",
      endExclusive: "2026-11-11",
    });
  });

  it("never reports a cycle before the Starter plan anchor", () => {
    expect(brevoBillingCycle(new Date("2026-09-01T00:00:00.000Z"), "2026-09-11")).toEqual({
      start: "2026-09-11",
      endExclusive: "2026-10-11",
    });
  });
});
