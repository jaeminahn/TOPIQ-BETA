import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError, api } from "../api";
import { Header } from "../components/Header";
import { ExitConfirmationDialog } from "../components/ExitConfirmationDialog";
import { IncorrectReview } from "../components/results/IncorrectReview";
import { ResultsSummary } from "../components/results/ResultsSummary";
import { ErrorState, LoadingState } from "../components/States";
import { useExitGuard } from "../hooks/useExitGuard";
import { useI18n } from "../i18n";
import type { Results } from "../types";
import { resultParameters, trackEventOnce } from "../analytics";
import { predictTopikGrade } from "../topikGrade";

export function ResultsPage() {
  const location = useLocation();
  const { locale, t } = useI18n();
  const resultToken = useMemo(
    () => new URLSearchParams(location.hash.replace(/^#/, "")).get("token")?.trim() || null,
    [location.hash],
  );
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const denyPath = useCallback(() => false, []);
  const exitGuard = useExitGuard(Boolean(results), denyPath);

  const load = useCallback(async () => {
    if (!resultToken) {
      setError(t("resultTokenMissing"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loadedResults = await api.results(resultToken);
      setResults(loadedResults);
      const predictedGrade = predictTopikGrade(loadedResults.score);
      trackEventOnce(`result_view.${loadedResults.sessionId}`, "result_view", {
        ...resultParameters(loadedResults),
        app_locale: locale,
        estimated_level: predictedGrade === "below-3" ? "BELOW_TOPIK_3" : `TOPIK_${predictedGrade}`,
        result_source: "email_link",
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "RESULT_LINK_EXPIRED") {
        setError(t("resultLinkExpired"));
      } else if (cause instanceof ApiError && cause.code === "INVALID_RESULT_TOKEN") {
        setError(t("resultLinkInvalid"));
      } else {
        setError(cause instanceof Error ? cause.message : t("resultLinkInvalid"));
      }
    } finally {
      setLoading(false);
    }
  }, [locale, resultToken, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !results) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("resultLinkInvalid")} retry={resultToken ? load : undefined} /></div>;

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
