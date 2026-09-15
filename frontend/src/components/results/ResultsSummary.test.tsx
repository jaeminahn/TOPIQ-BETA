import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Results } from "../../types";
import { ResultsSummary } from "./ResultsSummary";

const baseResults: Results = {
  examId: "reading-1",
  sessionId: "session-1",
  titleKo: "읽기 1회",
  section: "reading",
  score: 85,
  maxScore: 100,
  submittedAt: "2026-09-15T00:00:00.000Z",
  incorrectCount: 8,
  incorrect: [],
};

function renderSummary(results: Results = baseResults, locale: "ko" | "en" = "ko") {
  return render(
    <I18nProvider locale={locale}>
      <ResultsSummary results={results} />
    </I18nProvider>,
  );
}

describe("ResultsSummary", () => {
  it.each(["reading", "listening"] as const)("shows a predicted grade for %s results", (section) => {
    renderSummary({ ...baseResults, section });

    expect(screen.getByText("TOPIK II 예측 급수")).toBeInTheDocument();
    expect(screen.getByText("6급")).toBeInTheDocument();
  });

  it("shows the selected below-level-3 label", () => {
    renderSummary({ ...baseResults, score: 49 });

    expect(screen.getByText("3급 미만")).toBeInTheDocument();
  });

  it("does not estimate a level for a writing result", () => {
    renderSummary({ ...baseResults, section: "writing" });

    expect(screen.queryByText("TOPIK II 예측 급수")).not.toBeInTheDocument();
  });

  it("opens the criteria tooltip and closes it outside or with Escape", () => {
    renderSummary();
    const button = screen.getByRole("button", { name: "예측 급수 기준 보기" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent("50~59점 · 3급");
    expect(screen.getByRole("tooltip")).toHaveTextContent("실제 TOPIK II 급수는 듣기·읽기·쓰기 총점으로 결정됩니다.");

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("localizes the predicted grade and tooltip in English", () => {
    renderSummary(baseResults, "en");

    expect(screen.getByText("Predicted TOPIK II level")).toBeInTheDocument();
    expect(screen.getByText("Level 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View predicted level criteria" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("85–100 points · Level 6");
    expect(screen.getByRole("tooltip")).toHaveTextContent("combined Listening, Reading, and Writing score");
  });
});
