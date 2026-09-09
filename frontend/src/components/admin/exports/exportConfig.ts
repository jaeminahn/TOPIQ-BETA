import { FileQuestion, FileSpreadsheet, Rows3, Users } from "lucide-react";
import type { AdminExportDataset, AdminExportFilters, AdminExportOptions } from "../../../types";

export const initialExportFilters: AdminExportFilters = {
  status: "submitted",
  minAssignedCount: 0,
  outcome: "all",
  rating: "all",
  resultEmail: "all",
};

export const exportDatasets: Array<{
  id: AdminExportDataset;
  title: string;
  description: string;
  rowUnit: string;
  icon: typeof FileSpreadsheet;
  highlights: string[];
}> = [
  {
    id: "questions",
    title: "문항 분석 CSV",
    description: "문제 내용과 난이도 정보에 정답률·선택지 분포·응답 시간을 결합합니다.",
    rowUnit: "한 행 = 시험에 배치된 문항 버전 1개",
    icon: FileQuestion,
    highlights: ["문제 본문·선지·정답·해설", "응답자/전체 기준 정답률", "선택지별 선택률과 응답 시간"],
  },
  {
    id: "responses",
    title: "사용자 응답 CSV",
    description: "익명 응시자가 각 문항에서 남긴 답과 행동을 분석합니다.",
    rowUnit: "한 행 = 응시 세션의 출제 문항 1개",
    icon: Rows3,
    highlights: ["정답·오답·미응답 구분", "답안 변경과 문항 응답 시간", "세션·문항 버전 연결 키"],
  },
  {
    id: "sessions",
    title: "응시 세션 요약 CSV",
    description: "한 번의 시험 응시 결과를 세션 단위로 간단하게 비교합니다.",
    rowUnit: "한 행 = 제출 또는 폐기된 응시 1회",
    icon: Users,
    highlights: ["점수·득점률·완료 시간", "응답·미응답·정답·오답 수", "별점과 최신 결과 수신 이메일 원문"],
  },
];

export const exportFieldGuides: Record<AdminExportDataset, Array<{ title: string; fields: string }>> = {
  questions: [
    { title: "문항 식별", fields: "시험·세트·문항 ID와 버전, 영역, 문항 위치와 유형" },
    { title: "문항 내용", fields: "질문, 지문, 선택지 1~4, 정답, 해설, 듣기 대본과 시각 자료 JSON" },
    { title: "성과 지표", fields: "출제·응답·미응답·정답·오답 수, 두 정답률, 선택지 분포, 응답 시간" },
  ],
  responses: [
    { title: "익명 세션", fields: "session_id와 user_id, 시험, 모드, 상태, 완료 시각과 점수" },
    { title: "문항 연결", fields: "세트·문항 ID와 버전, 시험 내 위치, 문항 유형" },
    { title: "최종 응답", fields: "선택 답, 정답, 응답 결과, 시간, 변경·건너뜀·시간 초과 여부" },
  ],
  sessions: [
    { title: "응시 흐름", fields: "시험, 실전/연습, 제출/폐기, 시작·완료·소요 시각" },
    { title: "성과 요약", fields: "점수·득점률, 전체·응답·미응답·정답·오답 수" },
    { title: "후속 과정", fields: "별점·선택 언어, 최신 Brevo 접수 완료 이메일 원문과 접수 여부" },
  ],
};

export function exportFilterSummary(
  dataset: AdminExportDataset,
  filters: AdminExportFilters,
  options: AdminExportOptions,
) {
  const labels = [
    filters.mockTestId
      ? options.mockTests.find((test) => test.mockTestId === filters.mockTestId)?.titleKo ?? "선택 시험"
      : "전체 시험",
    filters.section === "reading" ? "읽기" : filters.section === "listening" ? "듣기" : "전체 영역",
    filters.mode === "timed" ? "실전" : filters.mode === "practice" ? "연습" : "전체 모드",
    filters.status === "submitted" ? "제출 완료" : filters.status === "abandoned" ? "폐기됨" : "제출+폐기",
    filters.from || filters.to ? `${filters.from ?? "처음"} ~ ${filters.to ?? "현재"} (KST)` : "전체 기간",
  ];
  if (dataset === "questions") {
    labels.push(filters.itemType ? `문항 유형 ${filters.itemType}` : "전체 문항 유형");
    labels.push(`최소 ${filters.minAssignedCount}회 출제`);
  }
  if (dataset === "responses") {
    const outcomes = { all: "미응답 포함", answered: "응답 문항만", correct: "정답만", incorrect: "오답만", unanswered: "미응답만" };
    labels.push(outcomes[filters.outcome]);
  }
  if (dataset === "sessions") {
    labels.push(filters.rating === "all" ? "전체 별점" : filters.rating === "none" ? "별점 없음" : `${filters.rating}점`);
    labels.push(filters.resultEmail === "all" ? "전체 메일 상태" : filters.resultEmail === "accepted" ? "메일 접수 완료" : "메일 접수 기록 없음");
  }
  return labels.join(" · ");
}
