import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi, api } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("telemetry delivery", () => {
  it("reuses the deduplication key when an event request is retried", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ accepted: false, submitted: false }),
      } as unknown as Response);

    const request = api.event(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
      1,
      "heartbeat",
      15_000,
    );
    await vi.advanceTimersByTimeAsync(250);
    await request;

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.clientEventId).toBe(firstBody.clientEventId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("request headers", () => {
  it("does not declare JSON content for a bodyless submit request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "submitted", resultEmailRequired: true }),
    } as unknown as Response);

    await api.submit(
      "10000000-0000-4000-8000-000000000001",
      "session-token",
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.body).toBeUndefined();
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("sends mandatory result delivery data and keeps the result token out of the URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: vi.fn().mockResolvedValue({ emailAccepted: true, maskedEmail: "u***r@example.com", expiresAt: "2026-10-09T00:00:00Z" }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ score: 80, incorrect: [] }),
      } as unknown as Response);

    await api.resultEmail("session-1", "session-token", { rating: 5, locale: "ko", email: "user@example.com" });
    await api.results("emailed-result-token");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/sessions\/session-1\/result-email$/);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ rating: 5, locale: "ko", email: "user@example.com" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/v1\/results$/);
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("emailed-result-token");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe("Bearer emailed-result-token");
  });

  it("lets the browser provide the multipart boundary for a listening image upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ visualAssetId: "asset-1", url: "https://example.com/choice.webp" }),
    } as unknown as Response);
    const file = new File(["cropped-image"], "choice.webp", { type: "image/webp" });

    await adminApi.uploadVisual(
      "admin-token",
      "10000000-0000-4000-8000-000000000001",
      1,
      2,
      file,
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBe(file);
    expect(headers.get("Authorization")).toBe("Bearer admin-token");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("lets the browser provide the multipart boundary for a reading image upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ visualAssetId: "asset-2", url: "https://example.com/material.webp" }),
    } as unknown as Response);
    const file = new File(["cropped-graph"], "graph.webp", { type: "image/webp" });

    await adminApi.uploadReadingMaterial(
      "admin-token",
      "10000000-0000-4000-8000-000000000002",
      3,
      file,
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBe(file);
    expect(headers.get("Authorization")).toBe("Bearer admin-token");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("continues to declare JSON content for serialized request bodies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 1, deletedObservations: 50 }),
    } as unknown as Response);

    await adminApi.deleteResponseSessions("admin-token", ["10000000-0000-4000-8000-000000000001"]);

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("admin response deletion", () => {
  it("sends selected session ids with a DELETE request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 2, deletedObservations: 100 }),
    } as unknown as Response);
    const sessionIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];

    await adminApi.deleteResponseSessions("admin-token", sessionIds);

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/admin\/responses\/sessions$/);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ sessionIds });
  });

  it("sends the required confirmation phrase for deleting all submitted responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 3, deletedObservations: 150 }),
    } as unknown as Response);

    await adminApi.deleteAllResponseSessions("admin-token", "전체 응답 삭제");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/admin\/responses\/sessions\/all$/);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ confirmation: "전체 응답 삭제" });
  });

  it("uses the dedicated endpoint and confirmation for all abandoned sessions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ deletedSessions: 4, deletedObservations: 0 }),
    } as unknown as Response);

    await adminApi.deleteAllAbandonedSessions("admin-token", "폐기 세션 전체 삭제");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/v1\/admin\/responses\/sessions\/abandoned\/all$/);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ confirmation: "폐기 세션 전체 삭제" });
  });
});

describe("admin CSV export", () => {
  it("sends filters to the preview endpoint with admin authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ rowCount: 10, sessionCount: 2, filters: {}, generatedAt: "2026-09-09T00:00:00Z" }),
    } as unknown as Response);

    await adminApi.exportPreview("admin-token", "responses", {
      status: "all",
      section: "reading",
      minAssignedCount: 0,
      outcome: "unanswered",
      rating: "all",
      resultEmail: "all",
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://example.com");
    expect(url.pathname).toBe("/v1/admin/exports/responses/preview");
    expect(url.searchParams.get("status")).toBe("all");
    expect(url.searchParams.get("section")).toBe("reading");
    expect(url.searchParams.get("outcome")).toBe("unanswered");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer admin-token");
  });

  it("reads the protected CSV filename and Blob response", async () => {
    const blob = new Blob(["csv-data"], { type: "text/csv" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="unigate_questions_20260909_120000_KST.csv"' }),
      blob: vi.fn().mockResolvedValue(blob),
    } as unknown as Response);

    const result = await adminApi.downloadExport("admin-token", "questions", {
      status: "submitted",
      minAssignedCount: 5,
      outcome: "all",
      rating: "all",
      resultEmail: "all",
    });

    expect(result).toEqual({ blob, filename: "unigate_questions_20260909_120000_KST.csv" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/admin/exports/questions.csv?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("minAssignedCount=5");
  });
});
