import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/admin/auth.js", () => ({
  requireAdmin: vi.fn(async (token: string) => {
    if (token !== "admin-token") throw Object.assign(new Error("Administrator required"), { statusCode: 403 });
    return { adminUserId: "10000000-0000-4000-8000-000000000001" };
  }),
}));

import { buildApp } from "../../src/app.js";
import { AppError } from "../../src/core/errors.js";
import type { TopikRepository } from "../../src/exam/repository.js";
import type { PreregistrationRepository } from "../../src/preregistration/repository.js";
import type { AdminPreregistrationRepository } from "../../src/admin/preregistrations/repository.js";
import type { ResultEmailSender } from "../../src/email/brevo-result-email.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const consent = { requestId: "20000000-0000-4000-8000-000000000001", consentVersion: "preregistration_v1" };
const sessionUrl = "/v1/sessions/30000000-0000-4000-8000-000000000001/result-email";

async function createApp(options: {
  registerLanding?: ReturnType<typeof vi.fn>;
  exam?: Partial<TopikRepository>;
  admin?: Partial<AdminPreregistrationRepository>;
  send?: ResultEmailSender["send"];
} = {}) {
  const app = await buildApp(
    (options.exam ?? {}) as TopikRepository, undefined,
    { send: options.send ?? vi.fn() }, undefined,
    { registerLanding: options.registerLanding ?? vi.fn() } as unknown as PreregistrationRepository,
    (options.admin ?? {}) as AdminPreregistrationRepository,
  );
  apps.push(app);
  return app;
}

describe("preregistration public API", () => {
  it("accepts only a validated email and supported consent version", async () => {
    const registerLanding = vi.fn().mockResolvedValue({ registrationId: "001-00000001" });
    const app = await createApp({ registerLanding });
    for (const payload of [
      { email: "bad", locale: "ko", ...consent },
      { email: "user@example.com", locale: "ko" },
      { email: "user@example.com", locale: "ko", ...consent, consentVersion: "old" },
    ]) {
      expect((await app.inject({ method: "POST", url: "/v1/preregistrations", payload })).statusCode).toBe(400);
    }
    expect(registerLanding).not.toHaveBeenCalled();
    const result = await app.inject({ method: "POST", url: "/v1/preregistrations", payload: {
      email: " User@Example.com ", locale: "ko", ...consent, source: "topik_result",
    } });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual({ registrationId: "001-00000001" });
    expect(registerLanding).toHaveBeenCalledWith({ email: "User@Example.com", locale: "ko", ...consent });
  });

  it.each(["RESULT_EMAIL_DISABLED", "RESULT_EMAIL_HOURLY_LIMIT_REACHED", "RESULT_EMAIL_MONTHLY_LIMIT_REACHED"])(
    "commits a registration before the %s email rejection", async (code) => {
      const events: string[] = [];
      const registerResultPreregistration = vi.fn(async () => { events.push("registration committed"); return { registrationId: "002-00000001" }; });
      const prepareResultEmail = vi.fn(async () => { events.push("email rejected"); throw new AppError(429, code, "Unavailable"); });
      const app = await createApp({ exam: { registerResultPreregistration, prepareResultEmail } });
      const result = await app.inject({ method: "POST", url: sessionUrl, headers: { authorization: "Bearer session-token" },
        payload: { email: "user@example.com", locale: "en", rating: 5, preregistration: consent } });
      expect(result.statusCode).toBe(429);
      expect(events).toEqual(["registration committed", "email rejected"]);
    },
  );

  it("keeps preregistration independent of a provider failure", async () => {
    const registerResultPreregistration = vi.fn().mockResolvedValue({ registrationId: "002-00000001" });
    const prepareResultEmail = vi.fn().mockResolvedValue({ deliveryId: "delivery", recipient: "user@example.com" });
    const markResultEmailFailed = vi.fn();
    const app = await createApp({ exam: { registerResultPreregistration, prepareResultEmail, markResultEmailFailed }, send: vi.fn().mockRejectedValue(new Error("Provider down")) });
    const result = await app.inject({ method: "POST", url: sessionUrl, headers: { authorization: "Bearer session-token" },
      payload: { email: "user@example.com", locale: "ko", rating: 4, preregistration: consent } });
    expect(result.statusCode).toBe(502);
    expect(registerResultPreregistration).toHaveBeenCalledOnce();
    expect(markResultEmailFailed).toHaveBeenCalledWith("delivery", "BREVO_SEND_FAILED");
  });

  it("does not register invalid forms, legacy requests, or unauthorized sessions", async () => {
    const registerResultPreregistration = vi.fn().mockRejectedValue(new AppError(401, "INVALID_TOKEN", "Invalid token"));
    const prepareResultEmail = vi.fn().mockRejectedValue(new AppError(429, "LIMIT", "Limit"));
    const app = await createApp({ exam: { registerResultPreregistration, prepareResultEmail } });
    const headers = { authorization: "Bearer session-token" };
    expect((await app.inject({ method: "POST", url: sessionUrl, headers, payload: {
      email: "user@example.com", locale: "ko", rating: 0, preregistration: consent,
    } })).statusCode).toBe(400);
    expect(registerResultPreregistration).not.toHaveBeenCalled();
    await app.inject({ method: "POST", url: sessionUrl, headers, payload: { email: "user@example.com", locale: "ko", rating: 5 } });
    expect(registerResultPreregistration).not.toHaveBeenCalled();
    prepareResultEmail.mockClear();
    expect((await app.inject({ method: "POST", url: sessionUrl, headers, payload: {
      email: "user@example.com", locale: "ko", rating: 5, preregistration: consent,
    } })).statusCode).toBe(401);
    expect(prepareResultEmail).not.toHaveBeenCalled();
  });
});

describe("preregistration admin API", () => {
  it("protects listing, CSV and deletion with administrator authentication", async () => {
    const list = vi.fn(); const csvStream = vi.fn(); const remove = vi.fn();
    const app = await createApp({ admin: { list, csvStream, delete: remove } });
    for (const [method, url] of [["GET", "/v1/admin/preregistrations"], ["GET", "/v1/admin/preregistrations.csv"], ["DELETE", "/v1/admin/preregistrations/001-00000001"]] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { authorization: "Bearer user-token" } })).statusCode).toBe(403);
    }
    expect(list).not.toHaveBeenCalled(); expect(csvStream).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it("uses matching filters for paginated lists and unpaginated CSV", async () => {
    const list = vi.fn().mockResolvedValue({ registrations: [], total: 0, page: 2, pageSize: 50 });
    const csvStream = vi.fn().mockImplementation(() => Readable.from(["\uFEFF\"registration_id\"\r\n"]));
    const app = await createApp({ admin: { list, csvStream } });
    const query = "?source=landing&deduplicate=true&from=2026-10-01&to=2026-10-02&search=User&page=2";
    const headers = { authorization: "Bearer admin-token" };
    const result = await app.inject({ method: "GET", url: `/v1/admin/preregistrations${query}`, headers });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    const csv = await app.inject({ method: "GET", url: `/v1/admin/preregistrations.csv${query}`, headers });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-disposition"]).toContain(".csv");
    expect(list.mock.calls[0]?.[0]).toEqual(csvStream.mock.calls[0]?.[0]);
    expect(list.mock.calls[0]?.[1]).toEqual({ page: 2, pageSize: 50 });
    for (const invalid of ["deduplicate=garbage", "from=2026-02-30", "from=2026-10-02&to=2026-10-01"]) {
      expect((await app.inject({ method: "GET", url: `/v1/admin/preregistrations?${invalid}`, headers })).statusCode).toBe(400);
    }
  });

  it("deletes exactly one ID and accepts an already deleted ID", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const app = await createApp({ admin: { delete: remove } });
    const headers = { authorization: "Bearer admin-token" };
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await app.inject({ method: "DELETE", url: "/v1/admin/preregistrations/001-00000001", headers })).statusCode).toBe(204);
    }
    expect(remove).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", "001-00000001");
    expect((await app.inject({ method: "DELETE", url: "/v1/admin/preregistrations/003-00000001", headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: "/v1/admin/preregistrations/004-00000001", headers })).statusCode).toBe(400);
  });
});
