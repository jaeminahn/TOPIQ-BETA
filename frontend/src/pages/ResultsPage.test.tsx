import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, getSessionToken } from "../api";
import { readCompletedResults } from "../completedResults";
import { I18nProvider } from "../i18n";
import type { Results } from "../types";
import { ResultsPage } from "./ResultsPage";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  api: { results: vi.fn() },
  getSessionToken: vi.fn(),
}));

const unlockedResult: Results = {
  examId: "reading-1",
  sessionId: "completed-session",
  titleId: "Membaca 1",
  titleKo: "읽기 1회",
  score: 86,
  maxScore: 100,
  submittedAt: "2026-08-11T18:00:00.000Z",
  incorrectCount: 0,
  incorrect: [],
};

describe("ResultsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("unigate.topik.locale", "ko");
    vi.mocked(getSessionToken).mockReturnValue("result-token");
    vi.mocked(api.results).mockResolvedValue(unlockedResult);
  });

  it("stores an unlocked result when the result page opens", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/session/completed-session/results"]}>
          <Routes>
            <Route path="/session/:sessionId/results" element={<ResultsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText("모의고사 결과")).toBeInTheDocument();
    await waitFor(() => expect(readCompletedResults()["reading-1"]).toMatchObject({
      sessionId: "completed-session",
      score: 86,
    }));
  });
});
