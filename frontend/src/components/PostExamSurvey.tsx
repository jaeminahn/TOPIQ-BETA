import { useMemo } from "react";
import { countryOptions, currentSurveyYear, surveyCatalog, surveyText, type SurveyInput } from "../survey";

export const emptySurvey = (): SurveyInput => ({
  nationalityCode: "", birthYear: 0, topikReasons: [], topikReasonOther: null,
  koreanStudyDuration: "", topikExperience: "", currentTopikLevel: null, targetTopikLevel: 0,
  privacyConsentVersion: surveyCatalog.consentVersion,
});

export function isSurveyComplete(value: SurveyInput) {
  return Boolean(value.nationalityCode && value.birthYear >= 1950 && value.birthYear <= currentSurveyYear()
    && value.topikReasons.length && (!value.topikReasons.includes("other") || value.topikReasonOther?.trim())
    && value.koreanStudyDuration && value.topikExperience
    && (value.topikExperience === "none" || value.currentTopikLevel !== null) && value.targetTopikLevel >= 3);
}

export function PostExamSurvey({ value, onChange, locale, disabled }: {
  value: SurveyInput; onChange: (value: SurveyInput) => void; locale: "ko" | "en"; disabled: boolean;
}) {
  const text = surveyText[locale];
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const years = Array.from({ length: currentSurveyYear() - 1949 }, (_, i) => String(currentSurveyYear() - i));
  const choices = (options: string[][]) => options.map(([code, ko, en]) => ({ code, label: locale === "ko" ? ko : en }));
  const level = (n: number) => n === 0 ? text.noLevel : locale === "ko" ? `${n}급` : `Level ${n}`;
  const select = (id: string, label: string, selected: string, options: {code: string; label: string}[], change: (code: string) => void) => (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800">{label} <span className="text-xs text-gray-500">({text.required})</span></label>
      <select id={id} required value={selected} onChange={(event) => change(event.target.value)} className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm">
        <option value="" disabled>{text.choose}</option>
        {options.map(({code, label}) => <option key={code} value={code}>{label}</option>)}
      </select>
    </div>
  );
  const radio = (name: string, label: string, selected: string, options: {code: string; label: string}[], change: (code: string) => void) => (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-800">{label} <span className="text-xs text-gray-500">({text.required})</span></legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{options.map(({ code, label }) => <label key={code} className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-300 px-3 py-2 text-sm">
        <input type="radio" name={name} value={code} checked={selected === code} required onChange={() => change(code)} className="focus-ring" />{label}
      </label>)}</div>
    </fieldset>
  );
  return <fieldset disabled={disabled} className="mt-6 min-w-0 space-y-6 border-t border-gray-200 pt-6 disabled:opacity-60">
    {select("survey-nationality", text.nationality, value.nationalityCode, countries, (code) => onChange({...value, nationalityCode: code}))}
    {select("survey-birth-year", text.birthYear, String(value.birthYear || ""), years.map((year) => ({code: year, label: year})), (year) => onChange({...value, birthYear: Number(year)}))}
    <fieldset>
      <legend className="text-sm font-semibold text-gray-800">{text.reasons} <span className="text-xs text-gray-500">({text.required})</span></legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{choices(surveyCatalog.reasons).map(({code, label}) => <label key={code} className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-300 px-3 py-2 text-sm">
        <input type="checkbox" checked={value.topikReasons.includes(code)} className="focus-ring" onChange={(event) => {
          const reasons = event.target.checked ? [...value.topikReasons, code] : value.topikReasons.filter((reason) => reason !== code);
          onChange({...value, topikReasons: reasons, topikReasonOther: reasons.includes("other") ? value.topikReasonOther : null});
        }} />{label}
      </label>)}</div>
      {value.topikReasons.includes("other") && <label className="mt-3 block text-sm font-semibold">{text.otherReason} ({text.required})
        <textarea required maxLength={500} rows={3} value={value.topikReasonOther ?? ""} onChange={(event) => onChange({...value, topikReasonOther: event.target.value})} className="focus-ring mt-2 block w-full rounded-xl border border-gray-400 p-3 font-normal" />
      </label>}
    </fieldset>
    {radio("study-duration", text.studyDuration, value.koreanStudyDuration, choices(surveyCatalog.studyDurations), (code) => onChange({...value, koreanStudyDuration: code}))}
    {radio("topik-experience", text.experience, value.topikExperience, choices(surveyCatalog.experiences), (code) => onChange({...value, topikExperience: code, currentTopikLevel: code === "none" ? null : value.currentTopikLevel}))}
    {value.topikExperience && value.topikExperience !== "none" && radio("current-level", text.currentLevel, value.currentTopikLevel === null ? "" : String(value.currentTopikLevel), Array.from({length: 7}, (_, n) => ({code: String(n), label: level(n)})), (code) => onChange({...value, currentTopikLevel: Number(code)}))}
    {radio("target-level", text.targetLevel, String(value.targetTopikLevel || ""), [3,4,5,6].map((n) => ({code: String(n), label: level(n)})), (code) => onChange({...value, targetTopikLevel: Number(code)}))}
  </fieldset>;
}
