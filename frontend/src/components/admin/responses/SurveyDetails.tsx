import { countryOptions, optionLabel, surveyCatalog, surveyText, type SavedSurvey } from "../../../survey";

export function SurveyDetails({ survey }: { survey: SavedSurvey | null }) {
  if (!survey) return <p className="mb-4 text-sm text-gray-500">설문 미수집</p>;
  const text = surveyText.ko;
  const rows = [
    [text.nationality, countryOptions("ko").find(({code}) => code === survey.nationalityCode)?.label ?? survey.nationalityCode],
    [text.birthYear, String(survey.birthYear)],
    [text.reasons, survey.topikReasons.map((code) => optionLabel(surveyCatalog.reasons, code, "ko")).join(", ")],
    ...(survey.topikReasonOther ? [[text.otherReason, survey.topikReasonOther]] : []),
    [text.studyDuration, optionLabel(surveyCatalog.studyDurations, survey.koreanStudyDuration, "ko")],
    [text.experience, optionLabel(surveyCatalog.experiences, survey.topikExperience, "ko")],
    [text.currentLevel, survey.currentTopikLevel === null ? "해당 없음" : survey.currentTopikLevel === 0 ? text.noLevel : `${survey.currentTopikLevel}급`],
    [text.targetLevel, `${survey.targetTopikLevel}급`],
    [text.completed, `${new Date(survey.completedAt).toLocaleString("ko-KR", {timeZone: "Asia/Seoul"})} (KST) · ${survey.surveyVersion}`],
    [text.privacy, `${survey.privacyConsent ? "동의" : "미동의"} · ${survey.privacyConsentVersion} · ${new Date(survey.privacyConsentedAt).toLocaleString("ko-KR", {timeZone: "Asia/Seoul"})} (KST)`],
  ];
  return <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
    <h3 className="font-semibold">{text.details}</h3>
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{value}</dd>
    </div>)}</dl>
  </section>;
}
