import { z } from "zod";
import catalog from "./catalog.json" with { type: "json" };
import { AppError } from "../core/errors.js";

const code = (values: string[]) => z.string().refine((value) => values.includes(value));
export const surveySchema = z.object({
  nationalityCode: code([...catalog.countries, "OTHER"]),
  birthYear: z.number().int().min(1950).refine((year) => year <= Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date()))),
  topikReasons: z.array(code(catalog.reasons.map(([value]) => value!))).min(1).max(catalog.reasons.length)
    .refine((values) => new Set(values).size === values.length),
  topikReasonOther: z.string().trim().max(500).nullable(),
  koreanStudyDuration: code(catalog.studyDurations.map(([value]) => value!)),
  topikExperience: code(catalog.experiences.map(([value]) => value!)),
  currentTopikLevel: z.number().int().min(0).max(6).nullable(),
  targetTopikLevel: z.number().int().min(3).max(6),
  privacyConsentVersion: z.literal(catalog.consentVersion),
}).superRefine((value, ctx) => {
  if (value.topikExperience !== "none" && value.currentTopikLevel === null) {
    ctx.addIssue({ code: "custom", path: ["currentTopikLevel"], message: "Current level is required" });
  }
  if (value.topikReasons.includes("other") && !value.topikReasonOther) {
    ctx.addIssue({ code: "custom", path: ["topikReasonOther"], message: "Other reason is required" });
  }
}).transform((value) => ({
  ...value,
  topikReasons: catalog.reasons.map(([code]) => code!).filter((code) => value.topikReasons.includes(code)),
  topikReasonOther: value.topikReasons.includes("other") ? value.topikReasonOther : null,
  currentTopikLevel: value.topikExperience === "none" ? null : value.currentTopikLevel,
}));

export function parseInitialSurvey(input: unknown) {
  if (input === undefined) throw new AppError(400, "SURVEY_REQUIRED", "Please refresh and complete the post-exam survey.");
  const result = surveySchema.safeParse(input);
  if (!result.success) throw new AppError(400, "INVALID_SURVEY", "Please check all required survey answers.");
  return result.data;
}
