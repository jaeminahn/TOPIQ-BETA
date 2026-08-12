import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, getSessionToken } from "../api";
import { COMPLETED_RESULTS_KEY } from "../completedResults";
import { I18nProvider } from "../i18n";
import type { Exam } from "../types";
import { LandingPage } from "./LandingPage";

vi.mock("../api", () => ({
  api: { exams: vi.fn(), createSession: vi.fn() },
  getSessionToken: vi.fn(),
}));

const exams: Exam[] = [
  { id: "reading-2", slug: "topik-reading-2", titleId: "Membaca 2", titleKo: "읽기 2회", descriptionId: "Latihan membaca", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-1", slug: "topik-listening-1", titleId: "Mendengar 1", titleKo: "듣기 1회", descriptionId: "Latihan mendengar", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
  { id: "reading-1", slug: "topik-reading-1", titleId: "Membaca 1", titleKo: "읽기 1회", descriptionId: "Latihan membaca", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-2", slug: "topik-listening-2", titleId: "Mendengar 2", titleKo: "듣기 2회", descriptionId: "Latihan mendengar", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
];

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("unigate.topik.locale", "ko");
    localStorage.setItem(COMPLETED_RESULTS_KEY, JSON.stringify({
      "reading-1": { examId: "reading-1", sessionId: "completed-session", score: 82, maxScore: 100, submittedAt: "2026-08-11T12:00:00.000Z" },
    }));
    vi.mocked(api.exams).mockReset();
    vi.mocked(api.exams).mockResolvedValue(exams);
    vi.mocked(getSessionToken).mockReset();
    vi.mocked(getSessionToken).mockImplementation((sessionId) => sessionId === "completed-session" ? "result-token" : null);
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
    expect(rounds[0]).toHaveClass("border-primary-100", "bg-primary-50/60");
    expect(rounds[1]).toHaveAttribute("data-round", "2");
    expect(rounds[1]).toHaveClass("border-primary-100", "bg-primary-50/40");
    expect(within(rounds[0]).getByText("읽기 1회")).toBeInTheDocument();
    expect(within(rounds[0]).getByText("듣기 1회")).toBeInTheDocument();
    expect(within(rounds[1]).getByText("읽기 2회")).toBeInTheDocument();
    expect(within(rounds[1]).getByText("듣기 2회")).toBeInTheDocument();

    const scoreButton = within(rounds[0]).getByRole("button", { name: /최근 점수.*82.*100.*결과 보기/ });
    await userEvent.click(scoreButton);
    await waitFor(() => expect(screen.getByText("결과 목적지")).toBeInTheDocument());
  });
});
