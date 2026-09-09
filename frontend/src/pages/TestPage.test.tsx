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

describe("TestPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
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
