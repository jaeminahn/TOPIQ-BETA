import type { Exam, ExamMode, Results, TestSession } from "../types";
import { auth, request, requestWithRetry } from "./request";

export const sessionStorageKey = (sessionId: string) => `unigate.topik.session.${sessionId}`;

export function getSessionToken(sessionId: string): string | null {
  return localStorage.getItem(sessionStorageKey(sessionId));
}

export const api = {
  async exams(): Promise<Exam[]> {
    const data = await request<{ exams: Exam[] }>("/v1/exams");
    return data.exams;
  },

  async createSession(mockTestId: string, mode: ExamMode) {
    const created = await request<{ sessionId: string; userId: string; token: string }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ mockTestId, mode }),
    });
    localStorage.setItem(sessionStorageKey(created.sessionId), created.token);
    return created;
  },

  session(sessionId: string, token: string): Promise<TestSession> {
    return request(`/v1/sessions/${sessionId}`, { headers: auth(token) });
  },

  event(
    sessionId: string,
    token: string,
    itemOrder: number,
    eventType: "presented" | "hidden" | "heartbeat",
    durationMs: number,
  ) {
    const clientEventId = crypto.randomUUID();
    return requestWithRetry(() => request<{ accepted: boolean; submitted: boolean }>(
      `/v1/sessions/${sessionId}/items/${itemOrder}/events`,
      {
        method: "POST",
        headers: auth(token),
        keepalive: true,
        body: JSON.stringify({ clientEventId, eventType, durationMs }),
      },
    ));
  },

  answer(sessionId: string, token: string, itemOrder: number, selectedOption: number, durationMs: number) {
    const clientEventId = crypto.randomUUID();
    return requestWithRetry(() => request<{ accepted: boolean; submitted: boolean }>(
      `/v1/sessions/${sessionId}/items/${itemOrder}/answer`,
      {
        method: "PUT",
        headers: auth(token),
        keepalive: true,
        body: JSON.stringify({ clientEventId, selectedOption, durationMs }),
      },
    ));
  },

  audioPlayback(
    sessionId: string,
    token: string,
    audioAssetId: string,
    clientPlayId: string,
    eventType: "prepared" | "started" | "completed" | "interrupted",
  ) {
    return request<{ submitted: boolean; playNumber?: number; maxPlays?: number | null; audioUrl?: string }>(
      `/v1/sessions/${sessionId}/audio/${audioAssetId}/playback`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ clientPlayId, eventType }) },
    );
  },

  submit(sessionId: string, token: string) {
    return request<{ status: "submitted"; resultsLocked: boolean }>(`/v1/sessions/${sessionId}/submit`, {
      method: "POST",
      headers: auth(token),
    });
  },

  abandon(sessionId: string, token: string) {
    return request<{ status: "abandoned" }>(`/v1/sessions/${sessionId}/abandon`, {
      method: "POST",
      headers: auth(token),
    });
  },

  feedback(
    sessionId: string,
    token: string,
    input: { rating: number; locale: "ko" | "en"; email?: string; marketingConsent: boolean },
  ) {
    return request<{ resultsUnlocked: boolean; emailSubscribed: boolean }>(
      `/v1/sessions/${sessionId}/feedback`,
      { method: "POST", headers: auth(token), body: JSON.stringify(input) },
    );
  },

  results(sessionId: string, token: string): Promise<Results> {
    return request(`/v1/sessions/${sessionId}/results`, { headers: auth(token) });
  },
};
