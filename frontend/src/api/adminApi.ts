import type {
  AdminListeningGroup,
  AdminListeningSet,
  AdminReadingItem,
  AdminReadingSet,
  AdminResponseObservation,
  AdminResponseSession,
  AdminSummary,
  AdminExportDataset,
  AdminExportFilters,
  AdminExportOptions,
  AdminExportPreview,
  AdminQuestionRevision,
  AdminQuestionVersion,
  TtsJob,
  TtsStyle,
} from "../types";
import { auth, request, requestBlob } from "./request";

function queryString(filters: object) {
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

  setEmailEnabled(token: string, enabled: boolean) {
    return request<{ enabled: boolean; updatedAt: string }>("/v1/admin/email/settings", {
      method: "PUT",
      headers: auth(token),
      body: JSON.stringify({ enabled }),
    });
  },

  exportOptions(token: string) {
    return request<AdminExportOptions>("/v1/admin/exports/options", { headers: auth(token) });
  },

  exportPreview(token: string, dataset: AdminExportDataset, filters: AdminExportFilters) {
    return request<AdminExportPreview>(
      `/v1/admin/exports/${dataset}/preview${queryString(filters)}`,
      { headers: auth(token) },
    );
  },

  downloadExport(token: string, dataset: AdminExportDataset, filters: AdminExportFilters) {
    return requestBlob(
      `/v1/admin/exports/${dataset}.csv${queryString(filters)}`,
      { headers: auth(token) },
    );
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

  publishReadingSet(token: string, setId: string) {
    return request<{ mockTestId: string; slug: string; round: number | null; published: boolean; created: boolean }>(
      `/v1/admin/reading/sets/${setId}/publish`,
      { method: "POST", headers: auth(token) },
    );
  },

  responseSessions(token: string, filters: { status?: string; section?: string; correctness?: string; page?: number; pageSize?: number } = {}) {
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

  deleteAllAbandonedSessions(token: string, confirmation: string) {
    return request<{ deletedSessions: number; deletedObservations: number }>("/v1/admin/responses/sessions/abandoned/all", {
      method: "DELETE",
      headers: auth(token),
      body: JSON.stringify({ confirmation }),
    });
  },

  jobs(token: string) {
    return request<{ jobs: TtsJob[] }>("/v1/admin/tts/jobs", { headers: auth(token) });
  },

  listeningSets(token: string) {
    return request<{ sets: AdminListeningSet[] }>("/v1/admin/listening/sets", { headers: auth(token) });
  },

  registerListeningSet(token: string, setId: string) {
    return request<{ mockTestId: string; slug: string; round: number | null; published: boolean; created: boolean }>(
      `/v1/admin/listening/sets/${setId}/register`,
      { method: "POST", headers: auth(token) },
    );
  },

  audioUrl(token: string, audioAssetId: string) {
    return request<{ audioUrl: string }>(`/v1/admin/listening/audio/${audioAssetId}/url`, { headers: auth(token) });
  },

  generateSet(token: string, setId: string, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ queued: number; jobIds: string[] }>(`/v1/admin/listening/sets/${setId}/tts`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ forceRegenerate, ttsStyle }),
    });
  },

  generateGroup(token: string, setId: string, leaderItemId: string, forceRegenerate = false, ttsStyle: TtsStyle = { speakingRate: 1, stylePrompt: "" }) {
    return request<{ jobId: string | null; queued: boolean; targetCount: number }>(
      `/v1/admin/listening/sets/${setId}/audio-groups/${leaderItemId}/tts`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate, ttsStyle }) },
    );
  },

  deleteGroupAudio(token: string, setId: string, leaderItemId: string, audioAssetId: string) {
    return request<{ deleted: boolean; deletedBindings: number; storageDeleted: boolean; sharedAssetRetained: boolean }>(
      `/v1/admin/listening/sets/${setId}/audio-groups/${leaderItemId}/audio/${audioAssetId}`,
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

  generateSetVisuals(token: string, setId: string, forceRegenerate = false) {
    return request<{ queued: number; jobIds: string[] }>(
      `/v1/admin/listening/sets/${setId}/visuals/generate`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate }) },
    );
  },

  deleteVisual(token: string, itemId: string, itemVersion: number, optionNumber: number, visualAssetId: string) {
    return request<{ deleted: boolean; storageDeleted: boolean; sharedAssetRetained?: boolean }>(
      `/v1/admin/listening/items/${itemId}/versions/${itemVersion}/visual-options/${optionNumber}/assets/${visualAssetId}`,
      { method: "DELETE", headers: auth(token) },
    );
  },

  uploadReadingMaterial(token: string, itemId: string, itemVersion: number, file: File) {
    const form = new FormData();
    form.set("file", file);
    return request<{ visualAssetId: string; url: string }>(
      `/v1/admin/reading/items/${itemId}/versions/${itemVersion}/visual-material`,
      { method: "POST", headers: auth(token), body: form },
    );
  },

  generateReadingMaterial(token: string, itemId: string, itemVersion: number, forceRegenerate = false) {
    return request<{ queued: boolean; jobId: string | null }>(
      `/v1/admin/reading/items/${itemId}/versions/${itemVersion}/visual-material/generate`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate }) },
    );
  },

  generateReadingSetVisuals(token: string, setId: string, forceRegenerate = false) {
    return request<{ queued: number; jobIds: string[] }>(
      `/v1/admin/reading/sets/${setId}/visuals/generate`,
      { method: "POST", headers: auth(token), body: JSON.stringify({ forceRegenerate }) },
    );
  },

  deleteReadingMaterial(token: string, itemId: string, itemVersion: number, visualAssetId: string) {
    return request<{ deleted: boolean; storageDeleted: boolean; sharedAssetRetained?: boolean }>(
      `/v1/admin/reading/items/${itemId}/versions/${itemVersion}/visual-material/assets/${visualAssetId}`,
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

  reviseQuestionSet(token: string, setId: string, revisions: AdminQuestionRevision[]) {
    return request<{
      setId: string; mockTestIds: string[]; published: false;
      revisions: Array<{ position: number; itemId: string; itemVersion: number }>;
    }>(`/v1/admin/question-sets/${setId}/revisions`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ revisions }),
    });
  },

  questionVersions(token: string, setId: string, itemId: string) {
    return request<{ setId: string; itemId: string; position: number; currentVersion: number; versions: AdminQuestionVersion[] }>(
      `/v1/admin/question-sets/${setId}/items/${itemId}/versions`,
      { headers: auth(token) },
    );
  },
};
