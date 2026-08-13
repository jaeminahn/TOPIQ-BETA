import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { Question } from "../types";
import { normalizeQuestionOrder } from "./questionNavigation";
import { QuestionNavigatorDialog } from "./QuestionNavigatorDialog";

const questions: Question[] = Array.from({ length: 25 }, (_, index) => ({
  itemOrder: index + 1,
  section: "reading",
  testPosition: index + 1,
  itemId: `item-${index + 1}`,
  itemVersion: 1,
  itemType: index + 1 === 21 || index + 1 === 22 ? "paired_21_22" : "content_match",
  stem: "",
  passage: "지문",
  auxiliaryText: "",
  questionPrompt: "질문",
  highlightText: "",
  choices: ["1", "2", "3", "4"],
  selectedOption: index < 4 ? 1 : null,
}));

function Harness({ onSelect = vi.fn() }: { onSelect?: (order: number) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <I18nProvider>
      <button ref={triggerRef} onClick={() => setOpen(true)}>전체 문제 열기</button>
      <QuestionNavigatorDialog
        open={open}
        questions={questions}
        currentOrders={[21, 22]}
        returnFocusRef={triggerRef}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
      />
    </I18nProvider>
  );
}

describe("QuestionNavigatorDialog", () => {
  it("opens accessibly, shows states, and returns focus after Escape", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "전체 문제 열기" });
    await userEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "전체 문제" })).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(screen.getByText("답변 완료 4 · 미답변 21")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /문제 21, 현재 문제/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /문제 22, 현재 문제/ })).toHaveAttribute("aria-current", "step");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("selects a question, closes on the backdrop, and normalizes paired movement", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "전체 문제 열기" }));
    await userEvent.click(screen.getByRole("button", { name: /문제 22, 현재 문제/ }));
    expect(onSelect).toHaveBeenCalledWith(22);
    expect(normalizeQuestionOrder(questions, 22)).toBe(21);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "전체 문제 열기" }));
    await userEvent.click(screen.getByTestId("question-dialog-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
