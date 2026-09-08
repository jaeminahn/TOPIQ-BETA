const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? "https://topik-api.unigate.kr" : "")
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (init?.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Request failed",
    );
  }
  return body as T;
}

export async function requestWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [0, 250, 750];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status < 500) throw error;
    }
  }
  throw lastError;
}

export function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}
