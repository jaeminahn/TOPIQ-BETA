import type {
  AdminListeningGroup,
  AdminListeningMockTest,
  AdminListeningSet,
  AdminReadingItem,
  AdminReadingSet,
  AdminResponseObservation,
  AdminResponseSession,
  AdminSummary,
  AdminQuestionRevision,
  TtsJob,
  TtsStyle,
} from "../types";
import { auth, request } from "./request";

function queryString(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.size ? `?${query}` : "";
}

export const adminApi = {
  login(email: string, password: string) {
    return request<{ accessToken: string; expiresAt: number; admin: { id: string; email: string } }>("/v1/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me(token: string) {
    return request<{ admin: { id: string; email: string } }>("/v1/admin/me", { headers: auth(token) });
  },

  dashboard(token: string) {
    return request<{ summary: AdminSummary }>("/v1/admin/dashboard", { headers: auth(token) });
  },

  listeningItems(token: string, filters: { setId?: string; status?: string } = {}) {
    return request<{ items: AdminListeningGroup[] }>(
      `/v1/admin/listening/items${queryString(filters)}`,
      { headers: auth(token) },
    );
  },

  readingItems(token: string, filters: { setId?: string; search?: string } = {}) {
    return request<{ items: AdminReadingItem[] }>(
      `/v1/admin/reading/items${queryString(filters)}`,
      { headers: auth(token) },
    );
  },

  readingSets(token: string) {
    return request<{ sets: AdminReadingSet[] }>("/v1/admin/reading/sets", { headers: auth(token) });
  },

  publishReadingSet(token: string, setId: string, setVersion: number) {
    return request<{ mockTestId: string; slug: string; round: number | null; published: boolean; created: boolean }>(
      `/v1/admin/reading/sets/${setId}/versions/${setVersion}/publish`,
      { method: "POST", headers: auth(token) },
    );
  },

  responseSessions(token: string, filters: { section?: string; correctness?: string; page?: number; pageSize?: number } = {}) {
    return request<{ sessions: AdminResponseSession[]; total: number }>(
      `/v1/admin/responses/sessions${queryString(filters)}`,
      { headers: auth(token) },
    );
  },

  responseSession(token: string, sessionId: string) {
    return request<{ responses: AdminResponseObservation[] }>(
      `/v1/admin/responses/sessions/${sessionId}`,
      { headers: auth(token) },
    );
  },

  deleteResponseSessions(token: string, sessionIds: string[]) {
    return request<{ deletedSessions: number; deletedObservations: number }>("/v1/admin/responses/sessions", {
      method: "DELETE",
      headers: auth(token),
      body: JSON.stringify({ sessionIds }),
    });
  },

  deleteAllResponseSessions(token: string, confirmation: string) {
    return request<{ deletedSessions: number; deletedObservations: number }>("/v1/admin/responses/sessions/all", {
      method: "DELETE",
      headers: auth(token),
      body: JSON.stringify({ confirmation }),
    });
  },

  jobs(token: string) {
    return request<{ jobs: TtsJob[] }>("/v1/admin/tts/jobs", { headers: auth(token) });
  },

  mockTests(token: string) {
    return request<{ mockTests: AdminListeningMockTest[] }>("/v1/admin/listening/mock-tests", { headers: auth(token) });
  },

  listeningSets(token: string) {
    return request<{ sets: AdminListeningSet[] }>("/v1/admin/listening/sets", { headers: auth(token) });
  },

  registerListeningSet(token: string, setId: string, setVersion: number) {
    return request<{ mockTestId: string; slug: string; round: number | null; published: boolean; created: boolean }>(
      `/v1/admin/listening/sets/${setId}/versions/${setVersion}/register`,
      { method: "POST", headers: auth(token) },
    );
  },

  audioUrl(token: string, audioAssetId: string) {
    return request<{ audioUrl: string }>(`/v1/admin/listening/audio/${audioAssetId}/url`, { headers: auth(token) });
  },

  generateItem(token: string, itemId: string, itemVersion: number, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ jobId: string; queued: boolean }>(`/v1/admin/listening/items/${itemId}/versions/${itemVersion}/tts`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },

  generateSet(token: string, setId: string, setVersion: number, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ queued: number; jobIds: string[] }>(`/v1/admin/listening/sets/${setId}/versions/${setVersion}/tts`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },

  generateGroup(token: string, setId: string, setVersion: number, leaderItemId: string, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ jobId: string | null; queued: boolean; targetCount: number }>(
      `/v1/admin/listening/sets/${setId}/versions/${setVersion}/audio-groups/${leaderItemId}/tts`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate, ttsStyle }) },
    );
  },

  deleteAudio(token: string, itemId: string, itemVersion: number, audioAssetId: string) {
    return request<{ deleted: boolean; storageDeleted: boolean; sharedAssetRetained: boolean }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/audio/${audioAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },

  deleteGroupAudio(token: string, setId: string, setVersion: number, leaderItemId: string, audioAssetId: string) {
    return request<{ deleted: boolean; deletedBindings: number; storageDeleted: boolean; sharedAssetRetained: boolean }>(
      `/v1/admin/listening/sets/${setId}/versions/${setVersion}/audio-groups/${leaderItemId}/audio/${audioAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },

  uploadVisual(token: string, itemId: string, itemVersion: number, optionNumber: number, file: File) {
    const form = new FormData();
    form.set("file", file);
    return request<{ visualAssetId: string; url: string }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/visual-options/${optionNumber}`,
      { method: "POST", headers: auth(token), body: form },
    );
  },

  generateVisual(token: string, itemId: string, itemVersion: number, optionNumber: number, forceRegenerate = false) {
    return request<{ queued: boolean; jobId: string | null }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/visual-options/${optionNumber}/generate`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate }) },
    );
  },

  generateSetVisuals(token: string, setId: string, setVersion: number, forceRegenerate = false) {
    return request<{ queued: number; jobIds: string[] }>(
      `/v1/admin/listening/sets/${setId}/versions/${setVersion}/visuals/generate`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate }) },
    );
  },

  deleteVisual(token: string, itemId: string, itemVersion: number, optionNumber: number, visualAssetId: string) {
    return request<{ deleted: boolean; storageDeleted: boolean; sharedAssetRetained?: boolean }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/visual-options/${optionNumber}/assets/${visualAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },

  publish(token: string, mockTestId: string, published: boolean) {
    return request<{ published: boolean }>(`/v1/admin/mock-tests/${mockTestId}/publish`, {
      method: "PUT",
      headers: auth(token),
      body: JSON.stringify({ published }),
    });
  },

  reviseQuestionSet(token: string, setId: string, setVersion: number, revisions: AdminQuestionRevision[]) {
    return request<{
      setId: string; setVersion: number; mockTestIds: string[]; published: false;
      revisions: Array<{ position: number; itemId: string; itemVersion: number }>;
    }>(`/v1/admin/question-sets/${setId}/versions/${setVersion}/revisions`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ revisions }),
    });
  },
};
