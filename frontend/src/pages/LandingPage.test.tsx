import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, getSessionToken } from "../api";
import { COMPLETED_RESULTS_KEY } from "../completedResults";
import { I18nProvider } from "../i18n";
import type { Exam } from "../types";
import { saveActiveSession } from "../activeSessions";
import { LandingPage } from "./LandingPage";

vi.mock("../api", () => ({
  api: { exams: vi.fn(), createSession: vi.fn(), session: vi.fn(), abandon: vi.fn() },
  getSessionToken: vi.fn(),
}));

const exams: Exam[] = [
  { id: "reading-2", slug: "topik-reading-2", titleKo: "읽기 2회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-1", slug: "topik-listening-1", titleKo: "듣기 1회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
  { id: "reading-1", slug: "topik-reading-1", titleKo: "읽기 1회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-2", slug: "topik-listening-2", titleKo: "듣기 2회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
];

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(COMPLETED_RESULTS_KEY, JSON.stringify({
      "reading-1": { examId: "reading-1", sessionId: "completed-session", score: 82, maxScore: 100, submittedAt: "2026-08-11T12:00:00.000Z" },
    }));
    vi.mocked(api.exams).mockReset();
    vi.mocked(api.exams).mockResolvedValue(exams);
    vi.mocked(api.createSession).mockReset();
    vi.mocked(api.session).mockReset();
    vi.mocked(api.abandon).mockReset();
    vi.mocked(getSessionToken).mockReset();
    vi.mocked(getSessionToken).mockImplementation((sessionId) => sessionId === "completed-session" ? "result-token" : null);
  });

  it("asks to continue or restart a valid in-progress session and abandons it before restarting", async () => {
    saveActiveSession({ examId: "reading-1", sessionId: "active-session", mode: "timed", lastPosition: 12, startedAt: "2026-08-19T00:00:00Z" });
    localStorage.setItem("unigate.topik.session.active-session", "active-token");
    vi.mocked(api.session).mockResolvedValue({
      sessionId: "active-session", userId: "user-1", mode: "timed", status: "in_progress",
      startedAt: "2026-08-19T00:00:00Z", expiresAt: "2026-08-19T01:00:00Z", submittedAt: null,
      resultsUnlocked: false, serverTime: "2026-08-19T00:10:00Z",
      exam: { id: "reading-1", slug: "topik-reading-1", titleKo: "읽기 1회", titleEn: "Reading 1" }, questions: [],
    });
    vi.mocked(api.abandon).mockResolvedValue({ status: "abandoned" });
    vi.mocked(api.createSession).mockResolvedValue({ sessionId: "new-session", userId: "user-2", token: "new-token" });

    render(<I18nProvider><MemoryRouter initialEntries={["/"]}><Routes><Route path="/" element={<LandingPage />} /><Route path="/session/:sessionId" element={<p>새 시험</p>} /></Routes></MemoryRouter></I18nProvider>);
    const round = (await screen.findAllByTestId("exam-round"))[0];
    const readingCard = within(round).getByRole("heading", { name: "읽기 1회" }).closest("article")!;
    await userEvent.click(within(readingCard).getByRole("button", { name: /모의고사 시작/ }));
    expect(await screen.findByRole("dialog", { name: "진행 중인 시험이 있습니다" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /다시하기/ }));
    await waitFor(() => expect(api.abandon).toHaveBeenCalledWith("active-session", "active-token"));
    expect(api.createSession).toHaveBeenCalledWith("reading-1", "timed");
    expect(await screen.findByText("새 시험")).toBeInTheDocument();
  });

  it("groups reading and listening by round, applies round colors, and links the latest score", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/session/:sessionId/results" element={<p>결과 목적지</p>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    const rounds = await screen.findAllByTestId("exam-round");
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toHaveAttribute("data-round", "1");
    expect(rounds[0]).toHaveClass("border-gray-200", "bg-gray-50");
    expect(rounds[1]).toHaveAttribute("data-round", "2");
    expect(rounds[1]).toHaveClass("border-gray-200", "bg-gray-50");
    expect(within(rounds[0]).getByText("읽기 1회")).toBeInTheDocument();
    expect(within(rounds[0]).getByText("듣기 1회")).toBeInTheDocument();
    expect(within(rounds[1]).getByText("읽기 2회")).toBeInTheDocument();
    expect(within(rounds[1]).getByText("듣기 2회")).toBeInTheDocument();

    const scoreButton = within(rounds[0]).getByRole("button", { name: /최근 점수.*82.*100.*결과 보기/ });
    await userEvent.click(scoreButton);
    await waitFor(() => expect(screen.getByText("결과 목적지")).toBeInTheDocument());
  });

  it("switches the public site to English and persists the selection", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/"]}>
          <LandingPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    await screen.findAllByTestId("exam-round");
    await userEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("heading", { name: "Find out where you stand in TOPIK II." })).toBeInTheDocument();
    expect(screen.getByText("TOPIK II Reading Mock Test 1")).toBeInTheDocument();
    expect(screen.queryByText("A 50-question TOPIK II listening mock test.")).not.toBeInTheDocument();
    expect(localStorage.getItem("unigate.topik.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
