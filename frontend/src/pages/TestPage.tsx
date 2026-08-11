import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Grid3X3, Save, TimerOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { QuestionGroup } from "../components/QuestionGroup";
import { QuestionNavigatorDialog } from "../components/QuestionNavigatorDialog";
import { QuestionCard } from "../components/QuestionCard";
import { normalizeQuestionOrder } from "../components/questionNavigation";
import { ListeningAudioPlayer } from "../components/ListeningAudioPlayer";
import { ErrorState, LoadingState } from "../components/States";
import { useActiveTime } from "../hooks/useActiveTime";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function TestPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, setSession, error, loading, reload } = useSession(sessionId);
  const [currentOrder, setCurrentOrder] = useState(() => Number(sessionStorage.getItem(`unigate.topik.position.${sessionId}`)) || 1);
  const [saveError, setSaveError] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState(currentOrder);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const navigatorButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavigator = useCallback(() => setNavigatorOpen(false), []);

  const current = session?.questions.find((question) => question.itemOrder === currentOrder) ?? session?.questions[0];
  const displayQuestions = useMemo(() => {
    if (!session || !current) return [];
    if (!current.itemType.startsWith("paired_")) return [current];
    return session.questions.filter((question) => question.itemType === current.itemType).sort((a, b) => a.itemOrder - b.itemOrder);
  }, [current, session]);
  const lastDisplayOrder = displayQuestions.at(-1)?.itemOrder ?? currentOrder;
  const audioQuestion = displayQuestions.find((question) => question.audioAssetId) ?? current;
  useActiveTime(sessionId ?? "", token ?? "", activeOrder, Boolean(session && token && current && session.status === "in_progress"));

  const displayStartOrder = displayQuestions[0]?.itemOrder ?? currentOrder;
  useEffect(() => { setActiveOrder(displayStartOrder); }, [currentOrder, displayStartOrder]);

  useEffect(() => {
    if (!session) return;
    if (session.status === "submitted") {
      navigate(session.resultsUnlocked ? `/session/${session.sessionId}/results` : `/session/${session.sessionId}/feedback`, { replace: true });
      return;
    }
    if (session.mode === "timed" && session.expiresAt) {
      const offset = Date.now() - new Date(session.serverTime).getTime();
      const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(session.expiresAt!).getTime() + offset - Date.now()) / 1000)));
      tick();
      const interval = window.setInterval(tick, 1000);
      return () => window.clearInterval(interval);
    }
    setRemaining(null);
  }, [navigate, session]);

  useEffect(() => {
    if (remaining !== 0 || !sessionId || !token || submitting) return;
    setSubmitting(true);
    void api.submit(sessionId, token).finally(() => navigate(`/session/${sessionId}/feedback`, { replace: true }));
  }, [navigate, remaining, sessionId, submitting, token]);

  const answered = useMemo(() => session?.questions.filter((question) => question.selectedOption !== null).length ?? 0, [session]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="exam-shell"><Header compact /><LoadingState /></div>;
  if (error || !session || !current) return <div className="exam-shell"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;

  const go = (order: number) => {
    const bounded = normalizeQuestionOrder(session.questions, order);
    sessionStorage.setItem(`unigate.topik.position.${sessionId}`, String(bounded));
    setCurrentOrder(bounded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const answer = async (itemOrder: number, selectedOption: number) => {
    setSaveError(false);
    setSession({
      ...session,
      questions: session.questions.map((question) => question.itemOrder === itemOrder ? { ...question, selectedOption } : question),
    });
    setActiveOrder(itemOrder);
    try {
      const result = await api.answer(sessionId, token, itemOrder, selectedOption, 0);
      if (result.submitted) navigate(`/session/${sessionId}/feedback`, { replace: true });
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="exam-shell exam-angular pb-20">
      <Header compact />
      <div className="sticky top-0 z-10 border-b border-blue-100 bg-[#155fcc] text-white shadow-sm">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm font-extrabold">
            <span>{locale === "id" ? session.exam.titleId : session.exam.titleKo}</span>
            <span className="hidden rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] sm:inline">{answered} / {session.questions.length}</span>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-[#155fcc]">
            {remaining === null ? <TimerOff className="size-4" /> : <Clock3 className="size-4" />}
            <span>{remaining === null ? t("practiceMode") : `${t("timeLeft")} ${formatTime(remaining)}`}</span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between px-1 text-xs font-bold text-slate-500 sm:text-sm">
            <span>{t("question")} {displayQuestions.length > 1 ? `${displayQuestions[0].itemOrder}~${lastDisplayOrder}` : current.itemOrder} / {session.questions.length}</span>
            <span className="flex items-center gap-2"><Save className="size-4 text-emerald-500" /> {t("answered")} {answered}</span>
          </div>
          {current.section === "listening" && audioQuestion?.audioAssetId && <ListeningAudioPlayer key={audioQuestion.audioAssetId} sessionId={sessionId} token={token} audioAssetId={audioQuestion.audioAssetId} repeatCount={audioQuestion.repeatCount ?? 1} mode={session.mode} />}
          {current.itemType.startsWith("paired_") ? (
            <QuestionGroup
              questions={displayQuestions}
              transcriptMode={session.mode === "timed" ? "hidden" : "collapsible"}
              onActivate={setActiveOrder}
              onAnswer={(itemOrder, option) => void answer(itemOrder, option)}
            />
          ) : (
            <div onFocus={() => setActiveOrder(current.itemOrder)} onPointerDown={() => setActiveOrder(current.itemOrder)}>
              <QuestionCard question={current} transcriptMode={current.section === "listening" ? session.mode === "timed" ? "hidden" : "collapsible" : "hidden"} onAnswer={(option) => void answer(current.itemOrder, option)} />
            </div>
          )}
          {saveError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{t("saveError")}</p>}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(25,45,75,.08)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <button disabled={displayStartOrder === 1} onClick={() => go(displayStartOrder - 1)} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-35 sm:px-4"><ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t("previous")}</span></button>
          <button ref={navigatorButtonRef} type="button" onClick={() => setNavigatorOpen(true)} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-extrabold text-[#155fcc] sm:px-5"><Grid3X3 className="size-4" />{t("allQuestions")}</button>
          {lastDisplayOrder < session.questions.length ? (
            <button onClick={() => go(lastDisplayOrder + 1)} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-[#155fcc] px-5 py-2.5 text-sm font-extrabold text-white">{t("next")} <ArrowRight className="size-4" /></button>
          ) : (
            <button onClick={() => navigate(`/session/${sessionId}/review`)} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-[#155fcc] px-5 py-2.5 text-sm font-extrabold text-white"><CheckCircle2 className="size-4" /> {t("review")}</button>
          )}
        </div>
      </div>
      <QuestionNavigatorDialog
        open={navigatorOpen}
        questions={session.questions}
        currentOrders={displayQuestions.map((question) => question.itemOrder)}
        returnFocusRef={navigatorButtonRef}
        onClose={closeNavigator}
        onSelect={go}
      />
    </div>
  );
}
