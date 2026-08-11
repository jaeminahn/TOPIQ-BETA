import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { Question } from "../types";
import { QuestionGroup } from "./QuestionGroup";

const makeQuestion = (itemOrder: number, input: Partial<Question> = {}): Question => ({
  itemOrder,
  section: "reading",
  testPosition: itemOrder,
  itemId: `item-${itemOrder}`,
  itemVersion: 1,
  itemType: "paired_21_22",
  stem: "",
  passage: "회사는 새로운 서비스를 준비하고 고객에게 먼저 공개했다.",
  auxiliaryText: "",
  questionPrompt: `${itemOrder}번 질문입니다.`,
  highlightText: itemOrder === 21 ? "새로운 서비스" : "지문에 없는 인용문",
  choices: [1, 2, 3, 4].map((option) => `${itemOrder}-${option}`),
  selectedOption: null,
  ...input,
});

function renderGroup(questions: Question[], onAnswer = vi.fn(), transcriptMode: "visible" | "collapsible" | "hidden" = "hidden") {
  localStorage.setItem("unigate.topik.locale", "ko");
  return {
    onAnswer,
    ...render(<QuestionGroup questions={questions} transcriptMode={transcriptMode} onAnswer={onAnswer} />, { wrapper: I18nProvider }),
  };
}

describe("QuestionGroup", () => {
  it("renders one shared reading passage and separate related questions", async () => {
    const questions = [makeQuestion(21), makeQuestion(22)];
    const { onAnswer } = renderGroup(questions);

    expect(screen.getAllByText("21~22번 공통 지문")).toHaveLength(1);
    expect(screen.getAllByTestId("shared-question-material")).toHaveLength(1);
    expect(screen.getAllByTestId("inline-highlight")).toHaveLength(1);
    expect(screen.getByTestId("highlight-fallback")).toHaveTextContent("지문에 없는 인용문");
    expect(screen.getAllByText(/번 질문입니다/)).toHaveLength(2);

    await userEvent.click(screen.getByText("22-3"));
    expect(onAnswer).toHaveBeenCalledWith(22, 3);
  });

  it("renders a paired listening label and transcript control once", () => {
    const transcript = [{ speaker: "여자", text: "공통 듣기 대본입니다." }];
    renderGroup([
      makeQuestion(21, { section: "listening", passage: "", transcript }),
      makeQuestion(22, { section: "listening", passage: "", transcript }),
    ], vi.fn(), "collapsible");

    expect(screen.getAllByText("21~22번 공통 듣기")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "대본 보기" })).toHaveLength(1);
    expect(screen.queryByText("공통 듣기 대본입니다.")).not.toBeInTheDocument();
  });
});
