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
  api: { exams: vi.fn(), createSession: vi.fn(), session: vi.fn(), abandon: vi.fn(), preregister: vi.fn() },
}));

const exams: Exam[] = [
  { id: "reading-2", slug: "topik-reading-2", titleKo: "읽기 2회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-1", slug: "topik-listening-1", titleKo: "듣기 1회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
  { id: "reading-1", slug: "topik-reading-1", titleKo: "읽기 1회", descriptionKo: "읽기 연습", durationSeconds: 4200, questionCount: 50, maxScore: 100, section: "reading" },
  { id: "listening-2", slug: "topik-listening-2", titleKo: "듣기 2회", descriptionKo: "듣기 연습", durationSeconds: 3600, questionCount: 50, maxScore: 100, section: "listening" },
];

function renderLanding(locale?: "ko" | "en") {
  return render(
    <I18nProvider locale={locale}>
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
    vi.mocked(api.preregister).mockReset();
    vi.mocked(api.preregister).mockResolvedValue({ registrationId: "001-00000001" });
  });

  it("shows the consolidated landing navigation in the header", () => {
    renderLanding("ko");
    const navigation = screen.getByRole("navigation", { name: "페이지 섹션" });
    expect(navigation).toHaveTextContent("소개");
    expect(navigation).toHaveTextContent("모의고사");
    expect(navigation).toHaveTextContent("TOPIQ 소개");
    expect(navigation).toHaveTextContent("TOPIK 안내");
    expect(navigation).toHaveTextContent("FAQ");
    expect(navigation).not.toHaveTextContent("성적 활용");
  });

  it("validates email, announces consent, confirms registration and restores focus", async () => {
    renderLanding("ko");
    const opener = screen.getByRole("button", { name: "사전등록" });
    await userEvent.click(opener);
    const email = screen.getByRole("textbox", { name: "이메일" });
    expect(email).toHaveFocus();
    expect(screen.getAllByText("사전등록을 신청하면 정식 출시에 관한 소식을 이메일로 받아볼 수 있습니다").length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.type(email, "invalid");
    await userEvent.click(screen.getByRole("button", { name: "사전등록 신청" }));
    expect(api.preregister).not.toHaveBeenCalled();
    await userEvent.clear(email);
    await userEvent.type(email, "User@Example.com");
    await userEvent.click(screen.getByRole("button", { name: "사전등록 신청" }));
    expect(await screen.findByRole("dialog", { name: "사전등록 신청이 완료되었습니다." })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "이메일" })).not.toBeInTheDocument();
    expect(api.preregister).toHaveBeenCalledWith({ email: "User@Example.com", locale: "ko", requestId: expect.any(String), consentVersion: "preregistration_v1" });
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.getByRole("dialog").parentElement).toHaveClass("is-closing");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("retains input and the same request ID after a save failure", async () => {
    vi.mocked(api.preregister).mockRejectedValueOnce(new Error("Network failed"));
    renderLanding("ko");
    await userEvent.click(screen.getByRole("button", { name: "사전등록" }));
    await userEvent.type(screen.getByRole("textbox", { name: "이메일" }), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: "사전등록 신청" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
    expect(screen.getByRole("textbox", { name: "이메일" })).toHaveValue("user@example.com");
    const first = vi.mocked(api.preregister).mock.calls[0]![0];
    await userEvent.click(screen.getByRole("button", { name: "사전등록 신청" }));
    await screen.findByRole("dialog", { name: "사전등록 신청이 완료되었습니다." });
    expect(vi.mocked(api.preregister).mock.calls[1]![0]).toEqual(first);
  });

  it("traps keyboard focus and closes with Escape in English", async () => {
    renderLanding("en");
    const opener = screen.getByRole("button", { name: "Pre-register" });
    await userEvent.click(opener);
    const email = screen.getByRole("textbox", { name: "Email" });
    expect(email).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Submit pre-registration" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog").parentElement).toHaveClass("is-closing");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("prevents duplicate submissions while the server is saving", async () => {
    let resolve!: (value: { registrationId: string }) => void;
    vi.mocked(api.preregister).mockReturnValue(new Promise((done) => { resolve = done; }));
    renderLanding("ko");
    await userEvent.click(screen.getByRole("button", { name: "사전등록" }));
    await userEvent.type(screen.getByRole("textbox", { name: "이메일" }), "user@example.com");
    await userEvent.dblClick(screen.getByRole("button", { name: "사전등록 신청" }));
    expect(api.preregister).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "신청 중..." })).toBeDisabled();
    resolve({ registrationId: "001-00000001" });
    await screen.findByRole("dialog", { name: "사전등록 신청이 완료되었습니다." });
  });

  it("asks to continue or restart a valid in-progress session and abandons it before restarting", async () => {
    saveActiveSession({ examId: "reading-1", sessionId: "active-session", mode: "timed", lastPosition: 12, startedAt: "2026-08-19T00:00:00Z" });
    localStorage.setItem("unigate.topik.session.active-session", "active-token");
    vi.mocked(api.session).mockResolvedValue({
      sessionId: "active-session", userId: "user-1", mode: "timed", status: "in_progress",
      startedAt: "2026-08-19T00:00:00Z", expiresAt: "2026-08-19T01:00:00Z", submittedAt: null,
      rating: null, resultEmailSent: false, maskedResultEmail: null, resultLinkExpiresAt: null,
      serverTime: "2026-08-19T00:10:00Z",
      exam: { id: "reading-1", slug: "topik-reading-1", titleKo: "읽기 1회", titleEn: "Reading 1" }, questions: [],
    });
    vi.mocked(api.abandon).mockResolvedValue({ status: "abandoned" });

    renderLanding("ko");
    await userEvent.click(await screen.findByRole("button", { name: /모의고사 시작/ }));
    expect(await screen.findByRole("dialog", { name: "진행 중인 시험이 있습니다" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /다시하기/ }));
    await waitFor(() => expect(api.abandon).toHaveBeenCalledWith("active-session", "active-token"));
    expect(api.createSession).toHaveBeenCalledWith("reading-1", "timed");
    expect(await screen.findByText("새 시험")).toBeInTheDocument();
  });

  it("shows one selector row, defaults to the earliest reading test, and starts the chosen test and mode", async () => {
    renderLanding("ko");

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
    renderLanding("ko");

    const roundSelect = await screen.findByRole("combobox", { name: "회차" });
    const sectionSelect = screen.getByRole("combobox", { name: "영역" });
    expect(sectionSelect).toHaveValue("reading");

    await userEvent.selectOptions(roundSelect, "round-2");
    expect(sectionSelect).toHaveValue("listening");
    expect(screen.queryByRole("option", { name: "읽기" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /모의고사 시작/ }));
    await waitFor(() => expect(api.createSession).toHaveBeenCalledWith("listening-2", "timed"));
  });

  it("shows the public site and selector labels in English by default", async () => {
    renderLanding();

    await screen.findByRole("combobox", { name: "Set" });

    expect(screen.getByRole("heading", { name: "Find out where you stand in TOPIK II." })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Set" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Section" })).toHaveValue("reading");
    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveValue("timed");
    expect(screen.getByRole("option", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("unigate.topik.locale")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });
});
