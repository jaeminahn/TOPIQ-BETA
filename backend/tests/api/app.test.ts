import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, ttsStyleSchema } from "../../src/app.js";
import type { ResultEmailSender } from "../../src/email/brevo-result-email.js";
import type { TopikRepository } from "../../src/exam/repository.js";

const repositories: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((app) => app.close()));
});

describe("public API", () => {
  it("forwards first survey answers and returns survey errors before sending email", async () => {
    const survey = {nationalityCode: "VN", birthYear: 2000};
    const prepareResultEmail = vi.fn().mockRejectedValue(Object.assign(new Error("Check survey"), {statusCode: 400, code: "INVALID_SURVEY"}));
    const send = vi.fn();
    const app = await buildApp({prepareResultEmail} as unknown as TopikRepository, undefined, {send});
    repositories.push(app);
    const response = await app.inject({method: "POST", url: "/v1/sessions/10000000-0000-4000-8000-000000000001/result-email",
      headers: {authorization: "Bearer session-token"}, payload: {rating: 5, locale: "ko", email: "user@example.com", survey}});
    expect(response.statusCode).toBe(400);
    expect(prepareResultEmail).toHaveBeenCalledWith(expect.objectContaining({survey}));
    expect(send).not.toHaveBeenCalled();
  });
  it.each([{}, { durationMs: 15_000 }])("saves answers while ignoring legacy timing fields %j", async (legacyFields) => {
    const saveAnswer = vi.fn().mockResolvedValue({ accepted: true, submitted: false });
    const app = await buildApp({ saveAnswer } as unknown as TopikRepository);
    repositories.push(app);
    const sessionId = "10000000-0000-4000-8000-000000000001";
    const clientEventId = "20000000-0000-4000-8000-000000000001";
    const response = await app.inject({
      method: "PUT", url: `/v1/sessions/${sessionId}/items/1/answer`,
      headers: { authorization: "Bearer session-token" },
      payload: { clientEventId, selectedOption: 2, ...legacyFields },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, submitted: false });
    expect(saveAnswer).toHaveBeenCalledWith({ sessionId, itemOrder: 1, token: "session-token", clientEventId, selectedOption: 2 });
  });

  it("returns 404 for the removed timing event endpoint", async () => {
    const app = await buildApp({} as TopikRepository);
    repositories.push(app);
    const response = await app.inject({
      method: "POST", url: "/v1/sessions/10000000-0000-4000-8000-000000000001/items/1/events",
      headers: { authorization: "Bearer session-token" },
      payload: { clientEventId: "20000000-0000-4000-8000-000000000001", eventType: "heartbeat", durationMs: 15_000 },
    });
    expect(response.statusCode).toBe(404);
  });

  it("accepts fine-grained speaking rates only within the admin range", () => {
    expect(ttsStyleSchema.safeParse({ speakingRate: 0.8, stylePrompt: "" }).success).toBe(true);
    expect(ttsStyleSchema.safeParse({ speakingRate: 1.025, stylePrompt: "" }).success).toBe(true);
    expect(ttsStyleSchema.safeParse({ speakingRate: 1.2, stylePrompt: "" }).success).toBe(true);
    expect(ttsStyleSchema.safeParse({ speakingRate: 0.799, stylePrompt: "" }).success).toBe(false);
    expect(ttsStyleSchema.safeParse({ speakingRate: 1.201, stylePrompt: "" }).success).toBe(false);
  });

  it("exposes a health endpoint", async () => {
    const repository = { listExams: vi.fn() } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "unigate-topik-api" });
  });

  it("does not expose removed legacy listening administration routes", async () => {
    const app = await buildApp({} as TopikRepository);
    repositories.push(app);
    const itemId = "10000000-0000-4000-8000-000000000001";
    const assetId = "20000000-0000-4000-8000-000000000001";
    const mockTestId = "30000000-0000-4000-8000-000000000001";
    const requests = [
      { method: "GET" as const, url: "/v1/admin/listening/mock-tests" },
      { method: "POST" as const, url: `/v1/admin/listening/items/${itemId}/versions/1/tts`, payload: {} },
      { method: "DELETE" as const, url: `/v1/admin/listening/items/${itemId}/versions/1/audio/${assetId}` },
      { method: "PUT" as const, url: `/v1/admin/listening/mock-tests/${mockTestId}/publish`, payload: { published: true } },
    ];

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
    }
  });

  it("returns the published exam catalog", async () => {
    const listExams = vi.fn().mockResolvedValue([{ id: "exam-1", slug: "topik-ii-reading-1" }]);
    const repository = { listExams } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/exams" });
    expect(response.statusCode).toBe(200);
    expect(response.json().exams).toHaveLength(1);
    expect(listExams).toHaveBeenCalledOnce();
  });

  it("accepts a bodyless session submission", async () => {
    const submitSession = vi.fn().mockResolvedValue({
      status: "submitted",
      resultEmailRequired: true,
    });
    const repository = { submitSession } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/submit",
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "submitted", resultEmailRequired: true });
    expect(submitSession).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
    );
  });

  it("accepts a required email and asks Brevo to send the result link", async () => {
    const expiresAt = new Date("2026-10-09T00:00:00.000Z");
    const prepareResultEmail = vi.fn().mockResolvedValue({
      deliveryId: "delivery-1",
      recipient: "user@example.com",
      maskedEmail: "u***r@example.com",
      locale: "en",
      titleEn: "Reading Mock Test 1",
      titleKo: "읽기 모의고사 1회",
      resultToken: "result-token",
      expiresAt,
    });
    const markResultEmailAccepted = vi.fn().mockResolvedValue(undefined);
    const repository = { prepareResultEmail, markResultEmailAccepted } as unknown as TopikRepository;
    const send = vi.fn().mockResolvedValue({ messageId: "brevo-message-1" });
    const app = await buildApp(repository, undefined, { send } as ResultEmailSender);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/result-email",
      headers: { authorization: "Bearer session-token" },
      payload: { rating: 5, locale: "en", email: "user@example.com" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ emailAccepted: true, maskedEmail: "u***r@example.com", expiresAt: expiresAt.toISOString() });
    expect(prepareResultEmail).toHaveBeenCalledWith({
      sessionId: "10000000-0000-4000-8000-000000000001",
      token: "session-token",
      rating: 5,
      locale: "en",
      email: "user@example.com",
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipient: "user@example.com", resultToken: "result-token" }));
    expect(markResultEmailAccepted).toHaveBeenCalledWith("delivery-1", "brevo-message-1");
  });

  it("rejects a result email request without an email address", async () => {
    const app = await buildApp({} as TopikRepository);
    repositories.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/result-email",
      headers: { authorization: "Bearer session-token" },
      payload: { rating: 5, locale: "ko" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("keeps the result locked when Brevo rejects the delivery request", async () => {
    const prepareResultEmail = vi.fn().mockResolvedValue({
      deliveryId: "delivery-1", recipient: "user@example.com", maskedEmail: "u***r@example.com",
      locale: "ko", titleEn: "Reading 1", titleKo: "읽기 1회", resultToken: "result-token",
      expiresAt: new Date("2026-10-09T00:00:00.000Z"),
    });
    const markResultEmailFailed = vi.fn().mockResolvedValue(undefined);
    const repository = { prepareResultEmail, markResultEmailFailed } as unknown as TopikRepository;
    const app = await buildApp(repository, undefined, { send: vi.fn().mockRejectedValue(new Error("provider down")) });
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/result-email",
      headers: { authorization: "Bearer session-token" },
      payload: { rating: 4, locale: "ko", email: "user@example.com" },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("RESULT_EMAIL_SEND_FAILED");
    expect(markResultEmailFailed).toHaveBeenCalledWith("delivery-1", "BREVO_SEND_FAILED");
  });

  it("returns emailed results with no-store caching and a dedicated token", async () => {
    const getResultsByToken = vi.fn().mockResolvedValue({ section: "reading", score: 84, maxScore: 100, incorrect: [] });
    const app = await buildApp({ getResultsByToken } as unknown as TopikRepository);
    repositories.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/results",
      headers: { authorization: "Bearer emailed-result-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ section: "reading", score: 84 });
    expect(getResultsByToken).toHaveBeenCalledWith("emailed-result-token");
  });

  it("accepts audio preparation without recording a started event", async () => {
    const recordAudioPlayback = vi.fn().mockResolvedValue({
      submitted: false,
      playNumber: 1,
      audioUrl: "https://example.com/audio.mp3",
    });
    const repository = { recordAudioPlayback } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/audio/20000000-0000-4000-8000-000000000001/playback",
      headers: { authorization: "Bearer session-token" },
      payload: {
        clientPlayId: "30000000-0000-4000-8000-000000000001",
        eventType: "prepared",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordAudioPlayback).toHaveBeenCalledWith({
      sessionId: "10000000-0000-4000-8000-000000000001",
      audioAssetId: "20000000-0000-4000-8000-000000000001",
      clientPlayId: "30000000-0000-4000-8000-000000000001",
      eventType: "prepared",
      token: "session-token",
    });
  });

  it("preserves Fastify client errors instead of returning 500", async () => {
    const repository = { submitSession: vi.fn() } as unknown as TopikRepository;
    const app = await buildApp(repository);
    repositories.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/10000000-0000-4000-8000-000000000001/submit",
      headers: {
        authorization: "Bearer session-token",
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("FST_ERR_CTP_EMPTY_JSON_BODY");
  });
});
