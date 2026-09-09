import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, getSessionToken } from "../api";
import { I18nProvider } from "../i18n";
import type { TestSession } from "../types";
import { TestPage } from "./TestPage";

vi.mock("../api", () => ({
  api: {
    session: vi.fn(),
    answer: vi.fn(),
    submit: vi.fn(),
    event: vi.fn(),
  },
  getSessionToken: vi.fn(),
}));

vi.mock("../hooks/useActiveTime", () => ({ useActiveTime: vi.fn() }));

const timedSession: TestSession = {
  sessionId: "timed-session",
  userId: "user-1",
  mode: "timed",
  status: "in_progress",
  startedAt: "2026-08-15T00:00:00.000Z",
  expiresAt: "2026-08-15T00:05:00.000Z",
  submittedAt: null,
  rating: null,
  resultEmailSent: false,
  maskedResultEmail: null,
  resultLinkExpiresAt: null,
  serverTime: "2026-08-15T00:00:00.000Z",
  exam: { slug: "topik-ii-reading-1", titleKo: "읽기 모의고사" },
  questions: [{
    itemOrder: 1,
    section: "reading",
    testPosition: 1,
    itemId: "item-1",
    itemVersion: 1,
    itemType: "reading",
    stem: "알맞은 답을 고르세요.",
    passage: "본문",
    auxiliaryText: "",
    questionPrompt: "",
    highlightText: "",
    choices: ["하나", "둘", "셋", "넷"],
    selectedOption: null,
  }],
};

const timedListeningSession: TestSession = {
  ...timedSession,
  exam: { slug: "topik-ii-listening-1", titleKo: "듣기 모의고사" },
  questions: [
    {
      ...timedSession.questions[0],
      section: "listening",
      itemId: "listening-item-1",
      itemType: "listen_and_choose",
      stem: "",
      passage: "",
      questionPrompt: "들은 내용과 같은 것을 고르세요.",
    },
    {
      ...timedSession.questions[0],
      itemOrder: 2,
      testPosition: 2,
      section: "listening",
      itemId: "listening-item-2",
      itemType: "listen_and_choose",
      stem: "",
      passage: "",
      questionPrompt: "이어질 말을 고르세요.",
    },
  ],
};

describe("TestPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    window.scrollTo = vi.fn();
    vi.mocked(getSessionToken).mockReturnValue("session-token");
    vi.mocked(api.session).mockResolvedValue(timedSession);
    vi.mocked(api.answer).mockResolvedValue({ accepted: true, submitted: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the original deadline when an answer updates the session", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/timed-session"]}>
          <Routes>
            <Route path="/session/:sessionId" element={<TestPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("남은 시간 05:00")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("남은 시간 04:50")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByText("남은 시간 04:50")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText("남은 시간 04:49")).toBeInTheDocument();
  });

  it("does not render the duplicate answered-over-total badge", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/timed-session"]}>
          <Routes>
            <Route path="/session/:sessionId" element={<TestPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("0 / 1")).not.toBeInTheDocument();
    expect(screen.getByText("답변 완료 0")).toBeInTheDocument();
  });

  it("hides all-question navigation only in timed listening mode", async () => {
    vi.mocked(api.session).mockResolvedValue(timedListeningSession);
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/timed-session"]}>
          <Routes>
            <Route path="/session/:sessionId" element={<TestPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: "전체 문제" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("문제 2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "답안 검토" })).toBeInTheDocument();
  });

  it("keeps all-question navigation in listening practice mode", async () => {
    vi.mocked(api.session).mockResolvedValue({ ...timedListeningSession, mode: "practice", expiresAt: null });
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/timed-session"]}>
          <Routes>
            <Route path="/session/:sessionId" element={<TestPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "전체 문제" })).toBeInTheDocument();
  });

  it("applies the selected English locale to the test controls", async () => {
    localStorage.setItem("unigate.topik.locale", "en");
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/timed-session"]}>
          <Routes>
            <Route path="/session/:sessionId" element={<TestPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Time Left 05:00")).toBeInTheDocument();
    expect(screen.getByText("Answered 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Questions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });
});
