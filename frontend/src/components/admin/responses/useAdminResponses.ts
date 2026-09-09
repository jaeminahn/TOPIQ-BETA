import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../../api";
import type { AdminResponseObservation, AdminResponseSession } from "../../../types";

export type DeleteDialog = null | { mode: "selected" | "all" | "abandoned" };

export function useAdminResponses(
  token: string | null,
  onError: (message: string) => void,
  onDeleted: () => Promise<unknown>,
) {
  const [sessions, setSessions] = useState<AdminResponseSession[]>([]);
  const [details, setDetails] = useState<Record<string, AdminResponseObservation[]>>({});
  const [total, setTotal] = useState(0);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState("");
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [correctness, setCorrectness] = useState("");
  const [page, setPage] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await adminApi.responseSessions(token, {
        status: status || undefined,
        section: section || undefined,
        correctness: correctness || undefined,
        page,
        pageSize: 20,
      });
      setSessions(response.sessions);
      setTotal(response.total);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "사용자 응답을 불러오지 못했습니다.");
    }
  }, [correctness, onError, page, section, status, token]);

  useEffect(() => { void load(); }, [load]);

  const toggleDetails = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession("");
      return;
    }
    setExpandedSession(sessionId);
    if (!details[sessionId] && token) {
      try {
        const detail = await adminApi.responseSession(token, sessionId);
        setDetails((current) => ({ ...current, [sessionId]: detail.responses }));
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : "응답 상세를 불러오지 못했습니다.");
      }
    }
  };

  const closeDeleteDialog = () => {
    setDeleteDialog(null);
    setDeleteConfirmation("");
  };

  const confirmDeletion = async () => {
    if (!token || !deleteDialog) return;
    if (deleteDialog.mode === "all" && deleteConfirmation !== "전체 응답 삭제") return;
    if (deleteDialog.mode === "abandoned" && deleteConfirmation !== "폐기 세션 전체 삭제") return;
    setDeleting(true);
    onError("");
    try {
      if (deleteDialog.mode === "all") {
        await adminApi.deleteAllResponseSessions(token, deleteConfirmation);
      } else if (deleteDialog.mode === "abandoned") {
        await adminApi.deleteAllAbandonedSessions(token, deleteConfirmation);
      } else {
        await adminApi.deleteResponseSessions(token, Array.from(selectedSessions));
      }
      setSelectedSessions(new Set());
      setDetails({});
      setExpandedSession("");
      closeDeleteDialog();
      await Promise.all([load(), onDeleted()]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "응답 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return {
    sessions,
    details,
    total,
    selectedSessions,
    setSelectedSessions,
    expandedSession,
    status,
    setStatus: (value: string) => {
      setStatus(value);
      setPage(1);
      setSelectedSessions(new Set());
      setExpandedSession("");
    },
    section,
    setSection: (value: string) => {
      setSection(value);
      setPage(1);
      setSelectedSessions(new Set());
    },
    correctness,
    setCorrectness: (value: string) => {
      setCorrectness(value);
      setPage(1);
      setSelectedSessions(new Set());
    },
    page,
    setPage,
    deleteDialog,
    setDeleteDialog,
    deleteConfirmation,
    setDeleteConfirmation,
    deleting,
    toggleDetails,
    closeDeleteDialog,
    confirmDeletion,
    load,
  };
}
