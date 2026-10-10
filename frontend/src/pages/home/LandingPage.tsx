import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { clearActiveSession, getActiveSession, positionStorageKey, saveActiveSession, type ActiveSessionEntry } from "../../activeSessions";
import { Header } from "../../components/Header";
import { ExamCatalog } from "../../components/landing/ExamCatalog";
import { FullVersionSection } from "../../components/landing/FullVersionSection";
import { LandingHero } from "../../components/landing/LandingHero";
import { LandingSectionNav } from "../../components/landing/LandingSectionNav";
import { SiteFooter } from "../../components/landing/SiteFooter";
import { TopikGuide } from "../../components/landing/TopikGuide";
import type { Exam, ExamMode } from "../../types";
import { SessionResumeDialog } from "../../components/SessionResumeDialog";
import { PreregistrationDialog } from "../../components/landing/PreregistrationDialog";
import { examParameters, trackEvent, trackEventOnce } from "../../analytics";
import { useI18n } from "../../i18n";

export function LandingPage() {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const [exams, setExams] = useState<Exam[]>([]);
  const [mode, setMode] = useState<ExamMode>("timed");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeEntry, setResumeEntry] = useState<ActiveSessionEntry | null>(null);
  const [resumeExam, setResumeExam] = useState<Exam | null>(null);
  const [resumeMode, setResumeMode] = useState<ExamMode>("timed");
  const [preregistrationOpen, setPreregistrationOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.exams();
      setExams(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createNew = async (exam: Exam, selectedMode: ExamMode) => {
    const created = await api.createSession(exam.id, selectedMode);
    saveActiveSession({ examId: exam.id, sessionId: created.sessionId, mode: selectedMode, lastPosition: 1, startedAt: new Date().toISOString() });
    trackEventOnce(`quiz_start.${created.sessionId}`, "quiz_start", { ...examParameters(exam, selectedMode), app_locale: locale });
    navigate(`/session/${created.sessionId}`);
  };

  const start = async (exam: Exam, selectedMode: ExamMode) => {
    setStarting(exam.id);
    setError(null);
    try {
      const active = getActiveSession(exam.id);
      if (active) {
        const token = localStorage.getItem(`unigate.topik.session.${active.sessionId}`);
        if (token) {
          try {
            const session = await api.session(active.sessionId, token);
            if (session.status === "in_progress") {
              const lastPosition = Number(localStorage.getItem(positionStorageKey(active.sessionId))) || active.lastPosition || 1;
              setResumeEntry({ ...active, lastPosition });
              setResumeExam(exam);
              setResumeMode(selectedMode);
              setStarting(null);
              return;
            }
          } catch { /* Invalid and closed sessions are replaced below. */ }
        }
        clearActiveSession(exam.id, active.sessionId);
      }
      await createNew(exam, selectedMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
      setStarting(null);
    }
  };

  const closeResume = useCallback(() => { setResumeEntry(null); setResumeExam(null); }, []);
  const continueSession = () => {
    if (!resumeEntry) return;
    if (resumeExam) trackEvent("quiz_resume", {
      ...examParameters(resumeExam, resumeEntry.mode),
      app_locale: locale,
      resume_question_number: resumeEntry.lastPosition,
    });
    navigate(`/session/${resumeEntry.sessionId}`);
  };
  const restartSession = async () => {
    if (!resumeEntry || !resumeExam) return;
    setStarting(resumeExam.id);
    setError(null);
    try {
      const token = localStorage.getItem(`unigate.topik.session.${resumeEntry.sessionId}`);
      if (!token) throw new Error("기존 시험 세션을 확인할 수 없습니다.");
      await api.abandon(resumeEntry.sessionId, token);
      trackEventOnce(`quiz_abandon.${resumeEntry.sessionId}`, "quiz_abandon", {
        ...examParameters(resumeExam, resumeEntry.mode),
        app_locale: locale,
        answered_through_question: resumeEntry.lastPosition,
        abandon_reason: "restart",
      });
      clearActiveSession(resumeEntry.examId, resumeEntry.sessionId);
      const exam = resumeExam;
      closeResume();
      await createNew(exam, resumeMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restart exam");
      setStarting(null);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <Header><LandingSectionNav /></Header>
      <LandingHero />
      <div className="topiq-content-flow">
      <ExamCatalog
        exams={exams}
        mode={mode}
        loading={loading}
        error={error}
        starting={starting}
        onRetry={() => void load()}
        onModeChange={setMode}
        onStart={(exam) => void start(exam, mode)}
      />
      <FullVersionSection onPreregister={() => setPreregistrationOpen(true)} />
      <TopikGuide />
      <SiteFooter />
      </div>
      <SessionResumeDialog entry={resumeEntry} busy={starting !== null} onContinue={continueSession} onRestart={() => void restartSession()} onClose={closeResume} />
      {preregistrationOpen && <PreregistrationDialog onClose={() => setPreregistrationOpen(false)} />}
    </main>
  );
}
