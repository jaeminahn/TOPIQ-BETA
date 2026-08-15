import type { Locale } from "./i18n";

const labels: Record<Locale, Record<string, string>> = {
  ko: {
    grammar_blank: "문법 빈칸",
    similar_expression: "유사 표현",
    short_text_topic: "짧은 글 주제",
    content_match_short: "짧은 글 내용 일치",
    sentence_order: "문장 순서",
    paragraph_blank_short: "짧은 지문 빈칸",
    paragraph_blank: "지문 빈칸",
    headline_interpretation: "신문 제목 해석",
    content_match: "내용 일치",
    main_topic: "중심 생각",
    sentence_insertion: "문장 삽입",
    visual_scene: "그림 선택",
    visual_chart: "그래프 선택",
    next_response: "이어질 말",
    followup_action: "이어질 행동",
    content_match_once: "들은 내용 일치",
    main_idea_once: "들은 내용 중심 생각",
  },
  en: {
    grammar_blank: "Grammar Blank",
    similar_expression: "Similar Expression",
    short_text_topic: "Short Text Topic",
    content_match_short: "Short Text Detail",
    sentence_order: "Sentence Order",
    paragraph_blank_short: "Short Passage Blank",
    paragraph_blank: "Passage Blank",
    headline_interpretation: "Headline Interpretation",
    content_match: "Content Match",
    main_topic: "Main Idea",
    sentence_insertion: "Sentence Insertion",
    visual_scene: "Picture Selection",
    visual_chart: "Chart Selection",
    next_response: "Next Response",
    followup_action: "Next Action",
    content_match_once: "Listening Detail",
    main_idea_once: "Listening Main Idea",
  },
};

export function questionTypeLabel(itemType: string, section: string, locale: Locale = "ko") {
  if (itemType.startsWith("paired_")) {
    if (locale === "en") return section === "listening" ? "Shared Listening" : "Shared Passage";
    return section === "listening" ? "공통 듣기" : "공통 지문";
  }
  return labels[locale][itemType] ?? itemType.replaceAll("_", " ");
}
