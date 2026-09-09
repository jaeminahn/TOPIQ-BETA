import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { clearActiveSession, positionStorageKey, updateActivePosition } from "../activeSessions";
import { ExitConfirmationDialog } from "../components/ExitConfirmationDialog";
import { Header } from "../components/Header";
import { QuestionGroup } from "../components/QuestionGroup";
import { QuestionNavigatorDialog } from "../components/QuestionNavigatorDialog";
import { QuestionCard } from "../components/QuestionCard";
import { normalizeQuestionOrder } from "../components/questionNavigation";
import { ListeningAudioPlayer } from "../components/ListeningAudioPlayer";
import { ErrorState, LoadingState } from "../components/States";
import { ExamTimerBar } from "../components/test/ExamTimerBar";
import { QuestionProgress } from "../components/test/QuestionProgress";
import { TestNavigation } from "../components/test/TestNavigation";
import { useActiveTime } from "../hooks/useActiveTime";
import { useExamCountdown } from "../hooks/useExamCountdown";
import { useExitGuard } from "../hooks/useExitGuard";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";
import { localizedExamTitle } from "../examLocalization";

export function TestPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, setSession, error, loading, reload } = useSession(sessionId);
  const [currentOrder, setCurrentOrder] = useState(() => Number(localStorage.getItem(positionStorageKey(sessionId ?? ""))) || 1);
  const [saveError, setSaveError] = useState(false);
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
  const remaining = useExamCountdown(session);
  const activeTime = useActiveTime(sessionId ?? "", token ?? "", activeOrder, Boolean(session && token && current && session.status === "in_progress"));
  const allowedPath = useCallback((pathname: string) => pathname === `/session/${sessionId}/review`, [sessionId]);
  const exitGuard = useExitGuard(Boolean(session && session.status === "in_progress" && !submitting), allowedPath);

  const displayStartOrder = displayQuestions[0]?.itemOrder ?? currentOrder;
  useEffect(() => { setActiveOrder(displayStartOrder); }, [currentOrder, displayStartOrder]);

  useEffect(() => {
    if (!session) return;
    if (session.status === "submitted") {
      clearActiveSession(session.exam.id ?? session.exam.slug, session.sessionId);
      navigate(`/session/${session.sessionId}/feedback`, { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    if (remaining !== 0 || !sessionId || !token || submitting) return;
    setSubmitting(true);
    void api.submit(sessionId, token).finally(() => navigate(`/session/${sessionId}/feedback`, { replace: true }));
  }, [navigate, remaining, sessionId, submitting, token]);

  const answered = useMemo(() => session?.questions.filter((question) => question.selectedOption !== null).length ?? 0, [session]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="exam-shell bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !session || !current) return <div className="exam-shell bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;

  const go = (order: number) => {
    const bounded = normalizeQuestionOrder(session.questions, order);
    updateActivePosition(session.exam.id ?? session.exam.slug, sessionId, bounded);
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
      const result = await api.answer(sessionId, token, itemOrder, selectedOption, activeTime?.takeDuration() ?? 0);
      if (result.submitted) navigate(`/session/${sessionId}/feedback`, { replace: true });
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="exam-shell exam-angular bg-gray-100 pb-20">
      <Header compact />
      <ExamTimerBar title={localizedExamTitle(session.exam.titleKo, locale, { slug: session.exam.slug, titleEn: session.exam.titleEn })} remaining={remaining} />

      <main className="mx-auto max-w-5xl px-4 py-4 sm:px-8 sm:py-5">
        <div className="min-w-0">
          <QuestionProgress firstOrder={displayQuestions[0]?.itemOrder ?? current.itemOrder} lastOrder={lastDisplayOrder} total={session.questions.length} answered={answered} />
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
          {saveError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{t("saveError")}</p>}
        </div>
      </main>

      <TestNavigation firstOrder={displayStartOrder} lastOrder={lastDisplayOrder} total={session.questions.length} navigatorButtonRef={navigatorButtonRef} onPrevious={() => go(displayStartOrder - 1)} onOpenNavigator={() => setNavigatorOpen(true)} onNext={() => go(lastDisplayOrder + 1)} onReview={() => navigate(`/session/${sessionId}/review`)} />
      <QuestionNavigatorDialog
        open={navigatorOpen}
        questions={session.questions}
        currentOrders={displayQuestions.map((question) => question.itemOrder)}
        returnFocusRef={navigatorButtonRef}
        onClose={closeNavigator}
        onSelect={go}
      />
      <ExitConfirmationDialog open={exitGuard.blocked} variant="test" answered={answered} total={session.questions.length} onStay={exitGuard.stay} onLeave={() => { activeTime?.flush("hidden"); exitGuard.leave(); }} />
    </div>
  );
}
