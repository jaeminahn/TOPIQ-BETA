import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, getSessionToken } from "../api";
import { I18nProvider } from "../i18n";
import type { TestSession } from "../types";
import { FeedbackPage } from "./FeedbackPage";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  api: { session: vi.fn(), resultEmail: vi.fn() },
  getSessionToken: vi.fn(),
}));

const submittedSession: TestSession = {
  sessionId: "submitted-session",
  userId: "user-1",
  mode: "timed",
  status: "submitted",
  startedAt: "2026-09-09T00:00:00.000Z",
  expiresAt: "2026-09-09T01:00:00.000Z",
  submittedAt: "2026-09-09T00:50:00.000Z",
  rating: null,
  resultEmailSent: false,
  maskedResultEmail: null,
  resultLinkExpiresAt: null,
  serverTime: "2026-09-09T00:50:01.000Z",
  exam: { id: "exam-1", slug: "topik-ii-reading-1", titleKo: "읽기 1회" },
  questions: [],
};

function renderFeedback() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/session/submitted-session/feedback"]}>
        <Routes><Route path="/session/:sessionId/feedback" element={<FeedbackPage />} /></Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("FeedbackPage result email delivery", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getSessionToken).mockReturnValue("session-token");
    vi.mocked(api.session).mockResolvedValue(submittedSession);
    vi.mocked(api.resultEmail).mockResolvedValue({
      emailAccepted: true,
      maskedEmail: "u***r@example.com",
      expiresAt: "2026-10-09T00:50:00.000Z",
    });
  });

  it("requires a rating and email, then stays on a delivery confirmation", async () => {
    renderFeedback();

    const email = await screen.findByRole("textbox", { name: "결과를 받을 이메일 (필수)" });
    expect(email).toBeRequired();
    await userEvent.click(screen.getByRole("button", { name: "5 stars" }));
    await userEvent.type(email, "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /결과 링크 받기/ }));

    await waitFor(() => expect(api.resultEmail).toHaveBeenCalledWith("submitted-session", "session-token", {
      rating: 5,
      locale: "ko",
      email: "user@example.com",
    }));
    expect(await screen.findByText("결과 메일을 보냈습니다")).toBeInTheDocument();
    expect(screen.getByText("u***r@example.com")).toBeInTheDocument();
    expect(screen.queryByText("모의고사 결과")).not.toBeInTheDocument();
  });

  it("shows an existing accepted delivery without exposing the full address", async () => {
    vi.mocked(api.session).mockResolvedValue({
      ...submittedSession,
      rating: 4,
      resultEmailSent: true,
      maskedResultEmail: "o***r@example.com",
      resultLinkExpiresAt: "2026-10-09T00:50:00.000Z",
    });

    renderFeedback();

    expect(await screen.findByText("결과 메일을 보냈습니다")).toBeInTheDocument();
    expect(screen.getByText("o***r@example.com")).toBeInTheDocument();
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
  });
});
