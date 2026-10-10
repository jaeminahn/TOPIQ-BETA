import { describe, expect, it } from "vitest";
import { parseInitialSurvey } from "../../src/survey/validation.js";
import catalog from "../../src/survey/catalog.json" with { type: "json" };

export const validSurvey = {
  nationalityCode: "VN", birthYear: 2000, topikReasons: ["employment", "university"],
  topikReasonOther: null, koreanStudyDuration: "1_to_2_years", topikExperience: "none",
  currentTopikLevel: null, targetTopikLevel: 4, privacyConsentVersion: "post_exam_survey_v1",
};

describe("post-exam survey validation", () => {
  it("accepts countries, sorts reasons and removes inactive conditional answers", () => {
    expect(new Set(catalog.countries).size).toBe(249);
    expect(parseInitialSurvey({...validSurvey, currentTopikLevel: 2, topikReasonOther: "stale"})).toMatchObject({
      currentTopikLevel: null, topikReasonOther: null, topikReasons: ["university", "employment"],
    });
    expect(parseInitialSurvey({...validSurvey, nationalityCode: "OTHER", topikExperience: "once", currentTopikLevel: 0})).toMatchObject({currentTopikLevel: 0});
  });
  it("requires a survey from a legacy client", () => {
    expect(() => parseInitialSurvey(undefined)).toThrowError(expect.objectContaining({code: "SURVEY_REQUIRED"}));
  });
  it.each([
    {nationalityCode: "ZZ"}, {birthYear: 1949}, {birthYear: new Date().getUTCFullYear() + 1},
    {topikReasons: []}, {topikReasons: ["visa", "visa"]}, {topikReasons: ["unknown"]},
    {topikReasons: ["other"], topikReasonOther: "   "}, {topikReasonOther: "x".repeat(501)},
    {koreanStudyDuration: "unknown"}, {topikExperience: "once", currentTopikLevel: null},
    {targetTopikLevel: 2}, {privacyConsentVersion: "old"},
  ])("rejects invalid survey %j", (changes) => {
    expect(() => parseInitialSurvey({...validSurvey, ...changes})).toThrowError(expect.objectContaining({code: "INVALID_SURVEY"}));
  });
});
