import { AlertTriangle, ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { localizedExamTitle } from "../examLocalization";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

export function ReviewPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, error, loading, reload } = useSession(sessionId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !session) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;
  if (session.status === "submitted") {
    return <Navigate to={session.resultsUnlocked ? `/session/${sessionId}/results` : `/session/${sessionId}/feedback`} replace />;
  }

  const unanswered = session.questions.filter((question) => question.selectedOption === null);
  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submit(sessionId, token);
      navigate(`/session/${sessionId}/feedback`, { replace: true });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Unable to submit");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header compact />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="rounded-2xl border border-gray-300 bg-white p-6">
          <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">{localizedExamTitle(session.exam.titleKo, locale, { slug: session.exam.slug })}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{t("reviewTitle")}</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">{t("reviewBody")}</p>
            </div>
            <div className={`shrink-0 rounded-xl border px-4 py-3 text-center ${unanswered.length ? "border-orange-200 bg-orange-50 text-orange-700" : "border-green-200 bg-green-50 text-green-700"}`}>
              <span className="block text-xl font-semibold">{unanswered.length}</span>
              <span className="text-xs font-medium">{t("unanswered")}</span>
            </div>
          </div>

          <div className="mt-5 grid max-w-2xl grid-cols-5 gap-1.5 sm:grid-cols-10">
            {session.questions.map((question) => (
              <button key={question.itemOrder} onClick={() => { sessionStorage.setItem(`unigate.topik.position.${sessionId}`, String(question.itemOrder)); navigate(`/session/${sessionId}`); }} className={`focus-ring relative grid aspect-square min-h-11 place-items-center rounded-lg border text-xs font-medium ${question.selectedOption !== null ? "border-gray-200 bg-gray-50 text-gray-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>
                {question.itemOrder}
                {question.selectedOption !== null && <CheckCircle2 className="absolute right-1 top-1 size-3 text-gray-500" />}
              </button>
            ))}
          </div>

          {unanswered.length > 0 && (
            <div className="mt-5 flex gap-3 rounded-xl bg-orange-50 p-4 text-sm font-medium leading-5 text-orange-700">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <span>{unanswered.map((question) => question.itemOrder).join(", ")} · {t("unanswered")}</span>
            </div>
          )}
          <p className="mt-5 text-sm font-medium text-gray-500">{t("submitConfirm")}</p>
          {submitError && <p className="mt-3 text-sm font-semibold text-red-600">{submitError}</p>}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => navigate(`/session/${sessionId}`)} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"><ArrowLeft className="size-4" /> {t("backToTest")}</button>
            <button disabled={submitting} onClick={() => void submit()} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"><Send className="size-4" /> {submitting ? t("loading") : t("submit")}</button>
          </div>
        </div>
      </main>
    </div>
  );
}
