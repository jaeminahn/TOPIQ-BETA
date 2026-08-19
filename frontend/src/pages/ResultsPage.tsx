import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, getSessionToken } from "../api";
import { saveCompletedResult } from "../completedResults";
import { Header } from "../components/Header";
import { ExitConfirmationDialog } from "../components/ExitConfirmationDialog";
import { IncorrectReview } from "../components/results/IncorrectReview";
import { ResultsSummary } from "../components/results/ResultsSummary";
import { ErrorState, LoadingState } from "../components/States";
import { useI18n } from "../i18n";
import type { Results } from "../types";
import { useExitGuard } from "../hooks/useExitGuard";

export function ResultsPage() {
  const { sessionId } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const token = sessionId ? getSessionToken(sessionId) : null;
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const denyPath = useCallback(() => false, []);
  const exitGuard = useExitGuard(Boolean(results), denyPath);

  const load = useCallback(async () => {
    if (!sessionId || !token) return setLoading(false);
    setLoading(true);
    try {
      const loaded = await api.results(sessionId, token);
      saveCompletedResult(loaded);
      setResults(loaded);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "RESULTS_LOCKED") {
        navigate(`/session/${sessionId}/feedback`, { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : "Unable to load results");
    } finally {
      setLoading(false);
    }
  }, [navigate, sessionId, token]);

  useEffect(() => { void load(); }, [load]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !results) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={load} /></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header compact />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        <ResultsSummary results={results} />
        <IncorrectReview results={results} />
      </main>
      <ExitConfirmationDialog open={exitGuard.blocked} variant="results" onStay={exitGuard.stay} onLeave={exitGuard.leave} />
    </div>
  );
}
