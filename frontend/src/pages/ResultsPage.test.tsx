import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { I18nProvider } from "../i18n";
import type { Results } from "../types";
import { ResultsPage } from "./ResultsPage";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  api: { results: vi.fn() },
}));

const unlockedResult: Results = {
  examId: "reading-1",
  sessionId: "completed-session",
  titleKo: "읽기 1회",
  score: 86,
  maxScore: 100,
  submittedAt: "2026-08-11T18:00:00.000Z",
  incorrectCount: 0,
  incorrect: [],
};

function renderResults(path = "/results#token=email-result-token", locale: "ko" | "en" = "ko") {
  return render(
    <I18nProvider locale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/results" element={<ResultsPage />} /></Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.mocked(api.results).mockReset();
    vi.mocked(api.results).mockResolvedValue(unlockedResult);
  });

  it("loads the result with the token from the URL fragment", async () => {
    renderResults();

    expect(await screen.findByText("모의고사 결과")).toBeInTheDocument();
    await waitFor(() => expect(api.results).toHaveBeenCalledWith("email-result-token"));
  });

  it("localizes the result summary and exam title in English", async () => {
    renderResults("/results#token=email-result-token", "en");

    expect(await screen.findByText("Mock Test Results")).toBeInTheDocument();
    expect(screen.getByText("TOPIK II Reading Mock Test 1")).toBeInTheDocument();
    expect(screen.getByText("Excellent! You answered every question correctly.")).toBeInTheDocument();
  });

  it("does not request results when the email token is missing", async () => {
    renderResults("/results");

    expect(await screen.findByText("이메일의 결과 확인 버튼을 통해 접속해 주세요.")).toBeInTheDocument();
    expect(api.results).not.toHaveBeenCalled();
  });
});
