import { config } from "./config.js";
import type { Locale } from "./domain.js";

export interface ResultEmailInput {
  recipient: string;
  locale: Locale;
  titleKo: string;
  titleEn: string;
  resultToken: string;
  expiresAt: Date;
}

export interface ResultEmailSender {
  send(input: ResultEmailInput): Promise<{ messageId: string }>;
}

const emailColors = {
  primary: "#2D5EC5",
  primaryDark: "#162F7F",
  primaryLight: "#EDF2FC",
  primaryBorder: "#C9D8F7",
  pageBackground: "#F3F4F6",
} as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildResultEmail(input: ResultEmailInput, publicAppUrl: string) {
  const korean = input.locale === "ko";
  const examTitle = korean ? input.titleKo : input.titleEn || input.titleKo;
  const resultUrl = `${publicAppUrl}/results#token=${encodeURIComponent(input.resultToken)}`;
  const expiration = new Intl.DateTimeFormat(korean ? "ko-KR" : "en-US", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(input.expiresAt);
  const subject = korean ? `[UNIGATE] ${examTitle} 결과를 확인하세요` : `[UNIGATE] Your ${examTitle} results are ready`;
  const heading = korean ? "모의고사 결과가 준비되었습니다" : "Your mock test results are ready";
  const body = korean
    ? "아래 버튼을 눌러 점수와 다시 확인할 문제, 문항별 해설을 확인해 주세요."
    : "Use the button below to view your score, missed questions, and explanations.";
  const button = korean ? "결과 확인하기" : "View results";
  const expiryNotice = korean
    ? `이 링크는 ${expiration}까지 반복해서 사용할 수 있습니다.`
    : `You can use this link until ${expiration}.`;

  return {
    subject,
    resultUrl,
    textContent: `${heading}\n\n${examTitle}\n${body}\n\n${resultUrl}\n\n${expiryNotice}`,
    htmlContent: `<!doctype html><html><body style="margin:0;background:${emailColors.pageBackground};font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111827"><div style="max-width:560px;margin:0 auto;padding:32px 16px"><div style="overflow:hidden;background:#fff;border:1px solid ${emailColors.primaryBorder};border-radius:16px"><div style="height:6px;background:${emailColors.primary}"></div><div style="padding:32px"><p style="margin:0 0 8px;color:${emailColors.primary};font-size:12px;font-weight:700;letter-spacing:.08em">UNIGATE TOPIK II</p><h1 style="margin:0;color:${emailColors.primaryDark};font-size:24px">${escapeHtml(heading)}</h1><p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#4b5563">${escapeHtml(examTitle)}<br>${escapeHtml(body)}</p><a href="${escapeHtml(resultUrl)}" style="display:inline-block;margin-top:24px;padding:13px 22px;border-radius:10px;background:${emailColors.primary};color:#fff;text-decoration:none;font-weight:700">${escapeHtml(button)}</a><p style="margin:24px 0 0;padding:12px 14px;border-radius:10px;background:${emailColors.primaryLight};color:${emailColors.primaryDark};font-size:12px;line-height:1.6">${escapeHtml(expiryNotice)}</p></div></div></div></body></html>`,
  };
}

export class BrevoResultEmailSender implements ResultEmailSender {
  constructor(private readonly settings = config.brevo) {}

  async send(input: ResultEmailInput) {
    if (!this.settings.apiKey || !this.settings.senderEmail) {
      throw new Error("Brevo transactional email is not configured");
    }
    const content = buildResultEmail(input, this.settings.publicAppUrl);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.settings.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: this.settings.senderEmail, name: this.settings.senderName },
        to: [{ email: input.recipient, contactPixelTrackingConsent: false }],
        subject: content.subject,
        htmlContent: content.htmlContent,
        textContent: content.textContent,
        tags: ["topik-result"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Brevo rejected the email request (${response.status})`);
    const body = await response.json() as { messageId?: unknown };
    if (typeof body.messageId !== "string" || !body.messageId) {
      throw new Error("Brevo did not return a message id");
    }
    return { messageId: body.messageId };
  }
}
