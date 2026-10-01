import { z } from "zod";
import { preregistrationConsentVersion } from "./repository.js";

export const preregistrationConsentSchema = z.object({
  requestId: z.string().uuid(),
  consentVersion: z.literal(preregistrationConsentVersion),
});

export const preregistrationSchema = preregistrationConsentSchema.extend({
  email: z.string().trim().email().max(320),
  locale: z.enum(["ko", "en"]),
});
