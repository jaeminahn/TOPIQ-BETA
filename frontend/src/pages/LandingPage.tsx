import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { readCompletedResults } from "../completedResults";
import { Header } from "../components/Header";
import { ExamCatalog } from "../components/landing/ExamCatalog";
import { LandingHero } from "../components/landing/LandingHero";
import { SiteFooter } from "../components/landing/SiteFooter";
import type { Exam, ExamMode } from "../types";

export function LandingPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [modes, setModes] = useState<Record<string, ExamMode>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedResults] = useState(readCompletedResults);

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

  const start = async (exam: Exam) => {
    setStarting(exam.id);
    setError(null);
    try {
      const created = await api.createSession(exam.id, modes[exam.id] ?? "timed");
      navigate(`/session/${created.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
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
    </main>
  );
}
