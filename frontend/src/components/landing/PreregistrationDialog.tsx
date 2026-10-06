import { Mail, MailCheck } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { createPreregistrationConsent, type PreregistrationConsent } from "../../preregistration";
import { AccessibleDialog } from "../AccessibleDialog";
import { trackEvent } from "../../analytics";

export function PreregistrationDialog({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const submitting = useRef(false);
  const request = useRef<{ key: string; consent: PreregistrationConsent } | null>(null);
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const key = JSON.stringify([email.trim(), locale]);
      if (request.current?.key !== key) request.current = { key, consent: createPreregistrationConsent() };
      await api.preregister({ email: email.trim(), locale, ...request.current.consent });
      trackEvent("waitlist_signup", { signup_location: "landing_page", locale });
      setComplete(true);
    } catch {
      setError(t("preregistrationFailed"));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <AccessibleDialog key={complete ? "complete" : "form"} title={complete ? t("preregistrationComplete") : t("preregistrationTitle")} closeLabel={t("close")} busy={busy} onClose={onClose}>
    {complete ? <>
      <MailCheck className="mx-auto mt-6 size-12 text-green-600" aria-hidden="true" />
      <button data-autofocus data-dialog-close type="button" className="focus-ring mt-6 min-h-11 w-full rounded-xl bg-primary px-5 py-2.5 font-semibold text-white">{t("preregistrationConfirm")}</button>
    </> : <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label htmlFor="preregistration-email" className="block text-sm font-semibold text-gray-700">{t("preregistrationEmail")}</label>
      <div className="relative mt-2">
        <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input data-autofocus id="preregistration-email" required type="email" autoComplete="email" maxLength={320} disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} aria-describedby="preregistration-notice" className="focus-ring min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-12 pr-4 text-gray-900 disabled:opacity-60" />
      </div>
      <p id="preregistration-notice" className="mt-3 text-xs leading-5 text-gray-500">{t("preregistrationNotice")}</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="focus-ring mt-5 min-h-11 w-full rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{busy ? t("preregistrationSaving") : t("preregistrationSubmit")}</button>
    </form>}
  </AccessibleDialog>;
}
