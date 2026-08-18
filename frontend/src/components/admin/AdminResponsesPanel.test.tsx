import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../api";
import { I18nProvider } from "../../i18n";
import type { AdminResponseObservation, AdminResponseSession } from "../../types";
import { AdminResponsesPanel } from "./AdminResponsesPanel";

vi.mock("../../api", () => ({ adminApi: { audioUrl: vi.fn() } }));

const session: AdminResponseSession = {
  sessionId: "session-1", userId: "user-1", mockTestTitle: "TOPIK II 듣기 모의고사 1회",
  mode: "timed", status: "submitted", startedAt: "2026-08-19T10:00:00Z",
  submittedAt: "2026-08-19T11:00:00Z", score: 80, maxScore: 100, rating: 4,
  section: "listening", responseCount: 1, answeredCount: 1, unansweredCount: 0,
  correctCount: 0, incorrectCount: 1,
};

const response: AdminResponseObservation = {
  observationId: "observation-1", userId: "user-1", sessionId: "session-1",
  itemId: "item-1", itemVersion: 2, itemOrder: 7, section: "listening", testPosition: 7,
  mockTestTitle: session.mockTestTitle, itemType: "listen_and_choose", selectedOption: 2,
  correctAnswer: 3, isCorrect: false, responseTimeMs: 4500, skipped: false, timedOut: false,
  answerChanged: true, policyVersion: "STATIC_MOCK_V1", createdAt: "2026-08-19T11:00:00Z",
  mode: "timed", score: 80, rating: 4, explanation: "정답은 셋입니다.",
  question: {
    itemOrder: 7, section: "listening", testPosition: 7, itemId: "item-1", itemVersion: 2,
    itemType: "listen_and_choose", stem: "", passage: "", auxiliaryText: "",
    questionPrompt: "들은 내용과 같은 것을 고르십시오.", highlightText: "",
    choices: ["하나", "둘", "셋", "넷"], visualOptions: [], audioAssetId: "audio-1",
    repeatCount: 2, transcript: [{ speaker: "여자", text: "안녕하세요." }], selectedOption: 2,
  },
};

function renderPanel() {
  return render(<I18nProvider locale="ko"><AdminResponsesPanel
      token="admin-token" sessions={[session]} total={1} details={{ [session.sessionId]: [response] }}
      selectedSessions={new Set()} setSelectedSessions={vi.fn()} expandedSession={session.sessionId}
      onToggleDetails={vi.fn()} section="" onSectionChange={vi.fn()} correctness=""
      onCorrectnessChange={vi.fn()} page={1} onPageChange={vi.fn()} onDeleteRequest={vi.fn()}
    /></I18nProvider>);
}

describe("AdminResponsesPanel", () => {
  beforeEach(() => vi.mocked(adminApi.audioUrl).mockReset());

  it("opens the full question result and restores focus after Escape", async () => {
    vi.mocked(adminApi.audioUrl).mockResolvedValue({ audioUrl: "https://example.com/question.mp3" });
    renderPanel();
    const trigger = screen.getByRole("button", { name: "7번 문제 보기" });

    await userEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "7번 응답 문제" })).toBeInTheDocument();
    expect(screen.getByText("들은 내용과 같은 것을 고르십시오.")).toBeInTheDocument();
    expect(screen.getByText(/여자/)).toBeInTheDocument();
    expect(screen.getByText("정답은 셋입니다.")).toBeInTheDocument();
    expect(screen.getByText("선택 2 · 정답 3")).toBeInTheDocument();
    expect(screen.getByText("답안 변경")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "음원 재생" }));
    await waitFor(() => expect(adminApi.audioUrl).toHaveBeenCalledWith("admin-token", "audio-1"));
    expect(document.querySelector("audio")?.getAttribute("src")).toBe("https://example.com/question.mp3");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the question visible when audio loading fails and closes from the backdrop", async () => {
    vi.mocked(adminApi.audioUrl).mockResolvedValue({ audioUrl: "" });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "7번 문제 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "음원 재생" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("음원을 불러오지 못했습니다.");
    expect(screen.getByText("들은 내용과 같은 것을 고르십시오.")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("response-question-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
