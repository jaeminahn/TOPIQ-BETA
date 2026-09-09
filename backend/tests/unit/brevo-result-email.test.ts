import { afterEach, describe, expect, it, vi } from "vitest";
import { BrevoResultEmailSender, buildResultEmail, type ResultEmailInput } from "../../src/brevo-result-email.js";

const input: ResultEmailInput = {
  recipient: "user@example.com",
  locale: "ko",
  titleKo: "TOPIK II 읽기 모의고사 1회",
  titleEn: "TOPIK II Reading Mock Test 1",
  resultToken: "secret-result-token",
  expiresAt: new Date("2026-10-09T00:00:00.000Z"),
};

afterEach(() => vi.restoreAllMocks());

describe("Brevo result email", () => {
  it("builds a localized email containing only the fragment result link", () => {
    const result = buildResultEmail(input, "https://topiq.unigate.kr");
    expect(result.subject).toContain("결과를 확인하세요");
    expect(result.resultUrl).toBe("https://topiq.unigate.kr/results#token=secret-result-token");
    expect(result.htmlContent).toContain(result.resultUrl);
    expect(result.htmlContent).toContain("#2D5EC5");
    expect(result.htmlContent).toContain("#162F7F");
    expect(result.htmlContent).toContain("#EDF2FC");
    expect(result.htmlContent).toContain("#C9D8F7");
    expect(result.htmlContent).not.toContain("#6d28d9");
    expect(result.textContent).not.toMatch(/\b\d{1,3}\s*점\b/);
  });

  it("uses the configured no-reply sender and Brevo transactional endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ messageId: "message-1" }),
    } as unknown as Response);
    const sender = new BrevoResultEmailSender({
      apiKey: "brevo-key",
      senderEmail: "no-reply@unigate.kr",
      senderName: "UNIGATE",
      publicAppUrl: "https://topiq.unigate.kr",
    });

    await expect(sender.send(input)).resolves.toEqual({ messageId: "message-1" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(new Headers(request?.headers).get("api-key")).toBe("brevo-key");
    expect(body.sender).toEqual({ email: "no-reply@unigate.kr", name: "UNIGATE" });
    expect(body.to).toEqual([{ email: "user@example.com", contactPixelTrackingConsent: false }]);
  });
});
