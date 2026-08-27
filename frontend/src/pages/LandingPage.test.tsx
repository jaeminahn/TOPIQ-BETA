import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { saveActiveSession } from "../activeSessions";
import { I18nProvider } from "../i18n";
import type { Exam } from "../types";
import { LandingPage } from "./LandingPage";

vi.mock("../api", () => ({
  api: { exams: vi.fn(), createSession: vi.fn(), session: vi.fn(), abandon: vi.fn() },
}));

const exams: Exam[] = [
  { id: "reading-2", slug: "topik-reading-2", titleKo: "읽기 2회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-1", slug: "topik-listening-1", titleKo: "듣기 1회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
  { id: "reading-1", slug: "topik-reading-1", titleKo: "읽기 1회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-2", slug: "topik-listening-2", titleKo: "듣기 2회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
];

function renderLanding() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/session/:sessionId" element={<p>새 시험</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.exams).mockReset();
    vi.mocked(api.exams).mockResolvedValue(exams);
    vi.mocked(api.createSession).mockReset();
    vi.mocked(api.createSession).mockResolvedValue({ sessionId: "new-session", userId: "user-2", token: "new-token" });
    vi.mocked(api.session).mockReset();
    vi.mocked(api.abandon).mockReset();
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

    renderLanding();
    await userEvent.click(await screen.findByRole("button", { name: /모의고사 시작/ }));
    expect(await screen.findByRole("dialog", { name: "진행 중인 시험이 있습니다" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /다시하기/ }));
    await waitFor(() => expect(api.abandon).toHaveBeenCalledWith("active-session", "active-token"));
    expect(api.createSession).toHaveBeenCalledWith("reading-1", "timed");
    expect(await screen.findByText("새 시험")).toBeInTheDocument();
  });

  it("shows one selector row, defaults to the earliest reading test, and starts the chosen test and mode", async () => {
    renderLanding();

    const roundSelect = await screen.findByRole("combobox", { name: "회차" });
    const sectionSelect = screen.getByRole("combobox", { name: "영역" });
    const modeSelect = screen.getByRole("combobox", { name: "모드" });
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(roundSelect).toHaveValue("round-1");
    expect(sectionSelect).toHaveValue("reading");
    expect(modeSelect).toHaveValue("timed");
    expect(screen.queryByTestId("exam-round")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 점수")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모의고사 선택" })).not.toBeInTheDocument();

    await userEvent.selectOptions(roundSelect, "round-2");
    await userEvent.selectOptions(sectionSelect, "listening");
    await userEvent.selectOptions(modeSelect, "practice");
    await userEvent.click(screen.getByRole("button", { name: /모의고사 시작/ }));

    await waitFor(() => expect(api.createSession).toHaveBeenCalledWith("listening-2", "practice"));
    expect(await screen.findByText("새 시험")).toBeInTheDocument();
  });

  it("falls back to the available section when a round does not contain the current section", async () => {
    vi.mocked(api.exams).mockResolvedValue([exams[2], exams[3]]);
    renderLanding();

    const roundSelect = await screen.findByRole("combobox", { name: "회차" });
    const sectionSelect = screen.getByRole("combobox", { name: "영역" });
    expect(sectionSelect).toHaveValue("reading");

    await userEvent.selectOptions(roundSelect, "round-2");
    expect(sectionSelect).toHaveValue("listening");
    expect(screen.queryByRole("option", { name: "읽기" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /모의고사 시작/ }));
    await waitFor(() => expect(api.createSession).toHaveBeenCalledWith("listening-2", "timed"));
  });

  it("switches the public site and selector labels to English and persists the selection", async () => {
    renderLanding();

    await screen.findByRole("combobox", { name: "회차" });
    await userEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("heading", { name: "Find out where you stand in TOPIK II." })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Set" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Section" })).toHaveValue("reading");
    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveValue("timed");
    expect(screen.getByRole("option", { name: "Reading" })).toBeInTheDocument();
    expect(localStorage.getItem("unigate.topik.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
