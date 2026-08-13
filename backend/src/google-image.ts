import { GoogleAuth } from "google-auth-library";
import { config } from "./config.js";
import { AppError } from "./errors.js";

function credentials() {
  if (!config.googleImage.credentialsJson) return undefined;
  try {
    return JSON.parse(config.googleImage.credentialsJson) as Record<string, unknown>;
  } catch {
    throw new AppError(503, "IMAGE_CREDENTIALS_INVALID", "Google Cloud credentials JSON is invalid");
  }
}

export function buildTopikImagePrompt(prompt: string) {
  return [
    "Create one TOPIK II Korean listening-test answer-choice illustration.",
    "Black-and-white clean line art, white background, simple exam-print style, 4:3 composition.",
    "Show only the requested scene. Do not add captions, letters, numbers, speech bubbles, borders, or watermarks.",
    prompt.trim(),
  ].join(" ");
}

export class GoogleImageClient {
  async generate(prompt: string) {
    const { projectId, location, model } = config.googleImage;
    if (!projectId) throw new AppError(503, "IMAGE_PROVIDER_NOT_CONFIGURED", "Google Vertex image generation is not configured");
    const auth = new GoogleAuth({
      projectId,
      credentials: credentials(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predict`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: buildTopikImagePrompt(prompt) }],
        parameters: { sampleCount: 1, aspectRatio: "4:3", outputOptions: { mimeType: "image/png" }, addWatermark: true },
      }),
    });
    const body = await response.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      error?: { message?: string };
    };
    const prediction = body.predictions?.[0];
    if (!response.ok || !prediction?.bytesBase64Encoded) {
      throw new AppError(502, "IMAGE_PROVIDER_FAILED", body.error?.message ?? "Google Vertex image generation failed");
    }
    return { data: Buffer.from(prediction.bytesBase64Encoded, "base64"), mimeType: prediction.mimeType ?? "image/png", extension: "png" };
  }
}

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

export type ChartSpec = { title?: string; unit?: string; labels?: unknown[]; values?: unknown[]; chart_type?: string };

export function renderChartSvg(spec: ChartSpec) {
  const labels = Array.isArray(spec.labels) ? spec.labels.map(String).slice(0, 8) : [];
  const values = Array.isArray(spec.values) ? spec.values.map(Number).slice(0, labels.length) : [];
  if (!labels.length || values.length !== labels.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Visual chart_spec labels and values are missing or invalid");
  }
  const width = 800; const height = 600; const left = 110; const right = 60; const top = 110; const bottom = 110;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const min = Math.min(0, ...values); const max = Math.max(...values, 1); const range = max - min || 1;
  const y = (value: number) => top + chartHeight - ((value - min) / range) * chartHeight;
  const title = escapeXml(spec.title ?? ""); const unit = escapeXml(spec.unit ?? "");
  const common = `<rect width="800" height="600" fill="white"/><text x="400" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700">${title}</text><text x="55" y="90" font-family="Arial, sans-serif" font-size="18">${unit}</text><line x1="${left}" y1="${top}" x2="${left}" y2="${top + chartHeight}" stroke="#111" stroke-width="3"/><line x1="${left}" y1="${top + chartHeight}" x2="${left + chartWidth}" y2="${top + chartHeight}" stroke="#111" stroke-width="3"/>`;
  let marks = "";
  if (spec.chart_type === "bar") {
    const rowHeight = chartHeight / labels.length;
    marks = labels.map((label, index) => {
      const barWidth = ((values[index]! - min) / range) * (chartWidth - 170);
      const rowY = top + index * rowHeight + rowHeight * 0.2;
      return `<text x="${left + 8}" y="${rowY + rowHeight * 0.38}" font-family="Arial, sans-serif" font-size="17">${escapeXml(label)}</text><rect x="${left + 170}" y="${rowY}" width="${Math.max(2, barWidth)}" height="${rowHeight * 0.52}" fill="#777" stroke="#111"/><text x="${left + 180 + barWidth}" y="${rowY + rowHeight * 0.38}" font-family="Arial, sans-serif" font-size="17">${escapeXml(values[index])}</text>`;
    }).join("");
  } else {
    const step = labels.length === 1 ? 0 : chartWidth / (labels.length - 1);
    const points = values.map((value, index) => `${left + index * step},${y(value)}`).join(" ");
    marks = `<polyline points="${points}" fill="none" stroke="#111" stroke-width="5"/>` + labels.map((label, index) => `<circle cx="${left + index * step}" cy="${y(values[index]!)}" r="7" fill="white" stroke="#111" stroke-width="4"/><text x="${left + index * step}" y="${top + chartHeight + 34}" text-anchor="middle" font-family="Arial, sans-serif" font-size="17">${escapeXml(label)}</text><text x="${left + index * step}" y="${y(values[index]!) - 16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="17">${escapeXml(values[index])}</text>`).join("");
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">${common}${marks}</svg>`);
}
