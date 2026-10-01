export const preregistrationConsentVersion = "preregistration_v1" as const;
export type PreregistrationConsent = { requestId: string; consentVersion: typeof preregistrationConsentVersion };

export function createPreregistrationConsent(): PreregistrationConsent {
  return { requestId: crypto.randomUUID(), consentVersion: preregistrationConsentVersion };
}
