import { BookOpen, Headphones, Home, LayoutDashboard, LogOut, MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api";
import { AdminLogin } from "../components/admin/AdminLogin";
import { AdminOverview } from "../components/admin/AdminOverview";
import { AdminResponsesPanel, type DeleteDialog } from "../components/admin/AdminResponsesPanel";
import { ListeningAdminPanel } from "../components/admin/ListeningAdminPanel";
import { ReadingAdminPanel } from "../components/admin/ReadingAdminPanel";
import { ResponseDeleteDialog } from "../components/admin/ResponseDeleteDialog";
import { supabase } from "../supabase";
import type { AdminListeningSet, AdminReadingSet, AdminResponseObservation, AdminResponseSession, AdminSummary, TtsJob } from "../types";

type AdminTab = "overview" | "listening" | "reading" | "responses";

const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "요약", icon: LayoutDashboard },
  { id: "listening", label: "듣기 문항", icon: Headphones },
  { id: "reading", label: "읽기 문항", icon: BookOpen },
  { id: "responses", label: "사용자 응답", icon: MessageSquareText },
];

export function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [readingSets, setReadingSets] = useState<AdminReadingSet[]>([]);
  const [listeningSets, setListeningSets] = useState<AdminListeningSet[]>([]);
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [responseSessions, setResponseSessions] = useState<AdminResponseSession[]>([]);
  const [responseDetails, setResponseDetails] = useState<Record<string, AdminResponseObservation[]>>({});
  const [responseTotal, setResponseTotal] = useState(0);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState("");
  const [responseSection, setResponseSection] = useState("");
  const [responseCorrectness, setResponseCorrectness] = useState("");
  const [responsePage, setResponsePage] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("unigate.topik.admin.token");
    if (stored) void adminApi.me(stored).then(() => setToken(stored)).catch(() => sessionStorage.removeItem("unigate.topik.admin.token"));
    if (!supabase) return;
    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      if (data.session) void adminApi.me(data.session.access_token).then(() => setToken(data.session!.access_token)).catch(() => client.auth.signOut());
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.access_token ?? null;
      setToken(next);
      if (next) sessionStorage.setItem("unigate.topik.admin.token", next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [dashboard, jobData, listeningSetData, readingSetData, responseData] = await Promise.all([
        adminApi.dashboard(token),
        adminApi.jobs(token),
        adminApi.listeningSets(token),
        adminApi.readingSets(token),
        adminApi.responseSessions(token, {
          section: responseSection || undefined,
          correctness: responseCorrectness || undefined,
          page: responsePage,
          pageSize: 20,
        }),
      ]);
      setSummary(dashboard.summary);
      setJobs(jobData.jobs);
      setListeningSets(listeningSetData.sets);
      setReadingSets(readingSetData.sets);
      setResponseSessions(responseData.sessions);
      setResponseTotal(responseData.total);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "관리자 데이터를 불러오지 못했습니다.");
    }
  }, [responseCorrectness, responsePage, responseSection, token]);

  const loadListeningSets = useCallback(async () => {
    if (!token) return;
    try {
      const result = await adminApi.listeningSets(token);
      setListeningSets(result.sets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "듣기 회차를 불러오지 못했습니다.");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!token || !jobs.some((job) => job.status === "queued" || job.status === "processing")) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [jobs, load, token]);

  const action = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await operation();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };

  const toggleDetails = async (sessionId: string) => {
    if (expandedSession === sessionId) return setExpandedSession("");
    setExpandedSession(sessionId);
    if (!responseDetails[sessionId] && token) {
      try {
        const detail = await adminApi.responseSession(token, sessionId);
        setResponseDetails((current) => ({ ...current, [sessionId]: detail.responses }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "응답 상세를 불러오지 못했습니다.");
      }
    }
  };

  const confirmDeletion = async () => {
    if (!token || !deleteDialog) return;
    if (deleteDialog.mode === "all" && deleteConfirmation !== "전체 응답 삭제") return;
    const operation = deleteDialog.mode === "all"
      ? adminApi.deleteAllResponseSessions(token, deleteConfirmation)
      : adminApi.deleteResponseSessions(token, Array.from(selectedSessions));
    await action("delete-responses", () => operation);
    setSelectedSessions(new Set());
    setResponseDetails({});
    setExpandedSession("");
    setDeleteDialog(null);
    setDeleteConfirmation("");
  };

  const logout = () => {
    sessionStorage.removeItem("unigate.topik.admin.token");
    setToken(null);
    void supabase?.auth.signOut();
  };

  if (!token) return <AdminLogin onReady={setToken} />;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white"><div className="mx-auto flex h-16 max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8"><div><p className="text-xs font-semibold tracking-[.14em] text-primary">UNIGATE</p><h1 className="text-lg font-semibold text-gray-900">TOPIK 관리자</h1></div><div className="flex gap-2"><Link to="/" className="focus-ring flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-primary"><Home className="size-4" /> 일반 사이트</Link><button onClick={() => void load()} title="새로고침" className="focus-ring rounded-xl border border-gray-200 p-3 text-gray-600"><RefreshCw className="size-4" /></button><button onClick={logout} className="focus-ring flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"><LogOut className="size-4" /> 로그아웃</button></div></div></header>
      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
        <nav className="mb-7 flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2" aria-label="관리자 메뉴">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}><Icon className="size-4" />{label}</button>)}</nav>
        {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {tab === "overview" && summary && <AdminOverview summary={summary} jobs={jobs} />}
        {tab === "listening" && <ListeningAdminPanel token={token} sets={listeningSets} onError={setError} onSetsChanged={loadListeningSets} />}
        {tab === "reading" && <ReadingAdminPanel token={token} sets={readingSets} busy={busy} onError={setError} onPublish={(set) => action(`publish-reading-${set.setId}-${set.setVersion}`, () => adminApi.publishReadingSet(token, set.setId, set.setVersion))} />}
        {tab === "responses" && <AdminResponsesPanel sessions={responseSessions} total={responseTotal} details={responseDetails} selectedSessions={selectedSessions} setSelectedSessions={setSelectedSessions} expandedSession={expandedSession} onToggleDetails={(sessionId) => void toggleDetails(sessionId)} section={responseSection} onSectionChange={(value) => { setResponseSection(value); setResponsePage(1); }} correctness={responseCorrectness} onCorrectnessChange={(value) => { setResponseCorrectness(value); setResponsePage(1); }} page={responsePage} onPageChange={setResponsePage} onDeleteRequest={setDeleteDialog} />}
      </main>
      {deleteDialog && <ResponseDeleteDialog dialog={deleteDialog} selectedCount={selectedSessions.size} confirmation={deleteConfirmation} busy={Boolean(busy)} onConfirmationChange={setDeleteConfirmation} onCancel={() => { setDeleteDialog(null); setDeleteConfirmation(""); }} onConfirm={() => void confirmDeletion()} />}
    </div>
  );
}
