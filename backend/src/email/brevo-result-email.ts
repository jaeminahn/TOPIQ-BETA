import { config } from "../core/config.js";

export type EmailLocale = "ko" | "en";

export interface ResultEmailInput {
  recipient: string;
  locale: EmailLocale;
  titleKo: string;
  titleEn: string;
  resultToken: string;
  expiresAt: Date;
}

export interface ResultEmailSender {
  send(input: ResultEmailInput): Promise<{ messageId: string }>;
}

export interface QuotaWarningInput {
  sendId: string;
  cycleStart: string;
  cycleEnd: string;
  threshold: number;
  limit: number;
}

export interface QuotaWarningSender {
  sendQuotaWarning(input: QuotaWarningInput): Promise<{ messageIds: string[] }>;
}

interface BrevoEmailSettings {
  apiKey?: string;
  senderEmail?: string;
  senderName: string;
  publicAppUrl: string;
  alertEmails?: readonly string[];
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

export class BrevoResultEmailSender implements ResultEmailSender, QuotaWarningSender {
  constructor(private readonly settings: BrevoEmailSettings = config.brevo) {}

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

  async sendQuotaWarning(input: QuotaWarningInput) {
    if (!this.settings.apiKey || !this.settings.senderEmail || this.settings.alertEmails?.length !== 2) {
      throw new Error("Brevo quota warning email is not configured");
    }
    const cycleEnd = new Date(new Date(`${input.cycleEnd}T00:00:00+09:00`).getTime() - 24 * 60 * 60 * 1000);
    const endLabel = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(cycleEnd);
    const subject = `[UNIGATE] Brevo 월간 발송량 ${input.threshold.toLocaleString()}/${input.limit.toLocaleString()}건 도달`;
    const message = `Brevo 월간 발송량이 경고 기준에 도달했습니다.\n\n결제 주기: ${input.cycleStart} ~ ${endLabel}\n경고 기준: ${input.threshold.toLocaleString()}건\n월간 한도: ${input.limit.toLocaleString()}건\n경고 메일 2건 발송 후 남은 용량: ${(input.limit - input.threshold - 2).toLocaleString()}건`;
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.settings.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: this.settings.senderEmail, name: this.settings.senderName },
        subject,
        textContent: message,
        htmlContent: `<!doctype html><html><body style="font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111827"><div style="max-width:560px;margin:24px auto;padding:24px;border:1px solid ${emailColors.primaryBorder};border-radius:16px"><h1 style="font-size:22px;color:${emailColors.primaryDark}">${escapeHtml(subject)}</h1><p style="white-space:pre-line;line-height:1.7">${escapeHtml(message)}</p></div></body></html>`,
        messageVersions: this.settings.alertEmails.map((email) => ({
          to: [{ email, contactPixelTrackingConsent: false }],
        })),
        headers: { idempotencyKey: input.sendId },
        tags: ["topik-quota-warning"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Brevo rejected the quota warning request (${response.status})`);
    const body = await response.json() as { messageIds?: unknown };
    if (!Array.isArray(body.messageIds) || body.messageIds.length !== 2
      || !body.messageIds.every((messageId) => typeof messageId === "string" && messageId)) {
      throw new Error("Brevo did not return both quota warning message ids");
    }
    return { messageIds: body.messageIds as string[] };
  }
}
