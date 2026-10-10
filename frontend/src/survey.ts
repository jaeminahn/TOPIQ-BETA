import catalog from "../../backend/src/survey/catalog.json";

export { catalog as surveyCatalog };
export interface SurveyInput {
  nationalityCode: string;
  birthYear: number;
  topikReasons: string[];
  topikReasonOther: string | null;
  koreanStudyDuration: string;
  topikExperience: string;
  currentTopikLevel: number | null;
  targetTopikLevel: number;
  privacyConsentVersion: string;
}
export interface SavedSurvey extends SurveyInput {
  surveyVersion: string;
  completedAt: string;
  privacyConsent: boolean;
  privacyConsentedAt: string;
}

export const surveyText = {
  ko: {
    title: "TOPIK II 모의시험 응시자 사후 설문조사",
    body: "별점, 이메일과 설문을 작성하면 점수와 오답 해설 링크를 보내 드립니다. 설문은 응시 세션마다 한 번만 작성합니다.",
    nationality: "국적은 어디인가요?", birthYear: "출생연도가 어떻게 되나요?",
    reasons: "TOPIK 시험에 응시하려는 가장 큰 이유는 무엇인가요? (복수 선택)",
    otherReason: "기타 응시 이유", studyDuration: "한국어를 공부한 기간은 얼마나 되나요?",
    experience: "TOPIK II 시험에 응시한 경험이 있나요?", currentLevel: "현재 보유하고 있는 TOPIK 급수는 무엇인가요?",
    targetLevel: "이번 시험에서 목표로 하는 TOPIK 급수는 무엇인가요?",
    choose: "선택해 주세요", other: "기타", noLevel: "급수 없음", required: "필수",
    invalid: "필수 설문 항목을 모두 확인해 주세요.", refresh: "새로고침 후 사후 설문을 작성해 주세요.",
    consent: "‘결과 링크 받기’ 버튼을 누르면 이메일, 국적, 출생연도, 응시 이유, 학습 기간, 응시 경험과 급수를 설문 응답 분석 및 결과 전달을 위해 수집·이용하는 데 동의한 것으로 처리됩니다.",
    missing: "설문 미수집", details: "사후 설문", completed: "설문 완료", privacy: "개인정보 동의",
  },
  en: {
    title: "TOPIK II Mock Test Post-exam Survey",
    body: "Enter your rating, email and survey answers to receive your score and missed-question review. Complete the survey once per test session.",
    nationality: "What is your nationality?", birthYear: "What year were you born?",
    reasons: "What are your main reasons for taking TOPIK? (Select all that apply)",
    otherReason: "Other reason for taking TOPIK", studyDuration: "How long have you studied Korean?",
    experience: "How many times have you taken TOPIK II?", currentLevel: "What TOPIK level do you currently hold?",
    targetLevel: "What TOPIK level are you aiming for?",
    choose: "Please select", other: "Other", noLevel: "No level", required: "Required",
    invalid: "Please check all required survey answers.", refresh: "Please refresh and complete the post-exam survey.",
    consent: "By clicking ‘Email my result link’, you consent to the collection and use of your email, nationality, birth year, test reasons, study duration, test experience and TOPIK levels for survey analysis and result delivery.",
    missing: "Survey not collected", details: "Post-exam survey", completed: "Survey completed", privacy: "Privacy consent",
  },
};

export function countryOptions(locale: "ko" | "en") {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return catalog.countries.map((code) => ({ code, label: names.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
    .concat({ code: "OTHER", label: surveyText[locale].other });
}

export const currentSurveyYear = () => Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date()));
export const optionLabel = (options: string[][], code: string, locale: "ko" | "en") => options.find(([value]) => value === code)?.[locale === "ko" ? 1 : 2] ?? code;
