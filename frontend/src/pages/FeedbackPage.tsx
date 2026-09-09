import { ArrowRight, Mail, MailCheck, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { clearActiveSession } from "../activeSessions";
import { Header } from "../components/Header";
import { ErrorState, LoadingState } from "../components/States";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n";

type DeliveryReceipt = { maskedEmail: string; expiresAt: string };

export function FeedbackPage() {
  const { sessionId } = useParams();
  const { locale, t } = useI18n();
  const { token, session, error, loading, reload } = useSession(sessionId);
  const [rating, setRating] = useState(0);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryReceipt | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (session?.status === "submitted") clearActiveSession(session.exam.id ?? session.exam.slug, session.sessionId);
    if (session?.rating) setRating(session.rating);
  }, [session]);

  if (!sessionId || !token) return <><Header compact /><ErrorState message={t("sessionMissing")} /></>;
  if (loading) return <div className="min-h-screen bg-gray-100"><Header compact /><LoadingState /></div>;
  if (error || !session) return <div className="min-h-screen bg-gray-100"><Header compact /><ErrorState message={error ?? t("sessionMissing")} retry={reload} /></div>;
  if (session.status !== "submitted") return <Navigate to={`/session/${sessionId}`} replace />;

  const existingDelivery = session.resultEmailSent && session.maskedResultEmail && session.resultLinkExpiresAt
    ? { maskedEmail: session.maskedResultEmail, expiresAt: session.resultLinkExpiresAt }
    : null;
  const acceptedDelivery = editing ? null : delivery ?? existingDelivery;

  const save = async () => {
    if (!rating) return setFormError(t("ratingRequired"));
    if (!email.trim()) return setFormError(t("emailRequired"));
    setSaving(true);
    setFormError(null);
    try {
      const result = await api.resultEmail(sessionId, token, { rating, locale, email: email.trim() });
      setDelivery({ maskedEmail: result.maskedEmail, expiresAt: result.expiresAt });
      setEditing(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "RESULT_EMAIL_RATE_LIMITED") {
        setFormError(t("emailRateLimited"));
      } else if (cause instanceof ApiError && cause.code === "RESULT_EMAIL_SEND_FAILED") {
        setFormError(t("emailSendFailed"));
      } else {
        setFormError(cause instanceof Error ? cause.message : t("emailSendFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (acceptedDelivery) {
    const expiration = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      dateStyle: "long",
      timeZone: "Asia/Seoul",
    }).format(new Date(acceptedDelivery.expiresAt));
    return (
      <div className="min-h-screen bg-gray-100">
        <Header compact />
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
          <div className="rounded-2xl border border-gray-300 bg-white p-6 text-center sm:p-8">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-green-50 text-green-600"><MailCheck className="size-7" /></span>
            <h1 className="mt-5 text-2xl font-semibold text-gray-900">{t("emailAcceptedTitle")}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-600">{t("emailAcceptedBody")}</p>
            <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">{acceptedDelivery.maskedEmail}</p>
            <p className="mt-4 text-xs font-medium text-gray-500">{t("resultLinkValidUntil")} {expiration}</p>
            <button onClick={() => { setEditing(true); setDelivery(null); setEmail(""); }} className="focus-ring mt-6 min-h-11 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100">{t("resendResultEmail")}</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header compact />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
        <form className="rounded-2xl border border-gray-300 bg-white p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900">{t("feedbackTitle")}</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">{t("feedbackBody")}</p>
          </div>
          <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Rating" aria-required="true">
            {[1, 2, 3, 4, 5].map((value) => (
              <button type="button" key={value} onClick={() => setRating(value)} className="focus-ring rounded-lg p-1.5" aria-label={`${value} stars`} aria-pressed={rating === value}>
                <Star className={`size-8 sm:size-9 ${value <= rating ? "fill-orange-500 text-orange-500" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-gray-100 pt-5">
            <label htmlFor="result-email" className="block text-sm font-semibold text-gray-700">{t("emailLabel")}</label>
            <label className="relative mt-2 block">
              <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
              <input id="result-email" required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} className="focus-ring min-h-11 w-full rounded-xl border-2 border-gray-400 bg-transparent py-2.5 pl-12 pr-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-600" />
            </label>
            <p className="mt-2 text-xs font-medium leading-5 text-gray-500">{t("emailPrivacyNotice")}</p>
          </div>
          {formError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</p>}
          <button type="submit" disabled={saving} className="focus-ring mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? t("sendingResultEmail") : t("sendResultEmail")} <ArrowRight className="size-4" /></button>
        </form>
      </main>
    </div>
  );
}
