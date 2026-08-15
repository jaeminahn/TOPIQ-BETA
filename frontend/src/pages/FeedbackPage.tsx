import { ArrowRight, Mail, Star } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

export function FeedbackPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { token, session, error, loading, reload } = useSession(sessionId);
  const [rating, setRating] = useState(0);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !session) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;
  if (session.resultsUnlocked) {
    return <Navigate to={`/session/${sessionId}/results`} replace />;
  }
  if (session.status !== "submitted") {
    return <Navigate to={`/session/${sessionId}`} replace />;
  }

  const save = async () => {
    if (!rating) return setFormError(t("ratingRequired"));
    setSaving(true);
    setFormError(null);
    try {
      await api.feedback(sessionId, token, {
        rating,
        locale,
        email: email || undefined,
        marketingConsent: Boolean(email),
      });
      navigate(`/session/${sessionId}/results`, { replace: true });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save feedback");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header compact />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="rounded-2xl border border-gray-300 bg-white p-6 sm:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900">{t("feedbackTitle")}</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">{t("feedbackBody")}</p>
          </div>
          <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} onClick={() => setRating(value)} className="focus-ring rounded-lg p-1.5" aria-label={`${value} stars`} aria-pressed={rating === value}>
                <Star className={`size-8 sm:size-9 ${value <= rating ? "fill-orange-500 text-orange-500" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-gray-100 pt-5">
            <label className="block text-sm font-semibold text-gray-700">{t("emailLabel")}</label>
            <label className="relative mt-2 block">
              <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} className="focus-ring min-h-11 w-full rounded-xl border-2 border-gray-200 bg-transparent py-2.5 pl-12 pr-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary" />
            </label>
          </div>
          {formError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</p>}
          <button disabled={saving} onClick={() => void save()} className="focus-ring mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? t("loading") : t("unlock")} <ArrowRight className="size-4" /></button>
        </div>
      </main>
    </div>
  );
}
