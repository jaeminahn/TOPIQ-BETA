import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { clearActiveSession, getActiveSession, positionStorageKey, saveActiveSession, type ActiveSessionEntry } from "../activeSessions";
import { readCompletedResults } from "../completedResults";
import { Header } from "../components/Header";
import { ExamCatalog } from "../components/landing/ExamCatalog";
import { LandingHero } from "../components/landing/LandingHero";
import { SiteFooter } from "../components/landing/SiteFooter";
import type { Exam, ExamMode } from "../types";
import { SessionResumeDialog } from "../components/SessionResumeDialog";

export function LandingPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [modes, setModes] = useState<Record<string, ExamMode>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedResults] = useState(readCompletedResults);
  const [resumeEntry, setResumeEntry] = useState<ActiveSessionEntry | null>(null);
  const [resumeExam, setResumeExam] = useState<Exam | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.exams();
      setExams(data);
      setModes(Object.fromEntries(data.map((exam) => [exam.id, "timed"])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createNew = async (exam: Exam) => {
    const mode = modes[exam.id] ?? "timed";
    const created = await api.createSession(exam.id, mode);
    saveActiveSession({ examId: exam.id, sessionId: created.sessionId, mode, lastPosition: 1, startedAt: new Date().toISOString() });
    navigate(`/session/${created.sessionId}`);
  };

  const start = async (exam: Exam) => {
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
              setStarting(null);
              return;
            }
          } catch { /* Invalid and closed sessions are replaced below. */ }
        }
        clearActiveSession(exam.id, active.sessionId);
      }
      await createNew(exam);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
      setStarting(null);
    }
  };

  const closeResume = useCallback(() => { setResumeEntry(null); setResumeExam(null); }, []);
  const continueSession = () => {
    if (!resumeEntry) return;
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
      clearActiveSession(resumeEntry.examId, resumeEntry.sessionId);
      const exam = resumeExam;
      closeResume();
      await createNew(exam);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restart exam");
      setStarting(null);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <LandingHero />
      <ExamCatalog
        exams={exams}
        modes={modes}
        completedResults={completedResults}
        loading={loading}
        error={error}
        starting={starting}
        onRetry={() => void load()}
        onModeChange={(examId, mode) => setModes((current) => ({ ...current, [examId]: mode }))}
        onStart={(exam) => void start(exam)}
        onViewResults={(sessionId) => navigate(`/session/${sessionId}/results`)}
      />
      <SiteFooter />
      <SessionResumeDialog entry={resumeEntry} busy={starting !== null} onContinue={continueSession} onRestart={() => void restartSession()} onClose={closeResume} />
    </main>
  );
}
