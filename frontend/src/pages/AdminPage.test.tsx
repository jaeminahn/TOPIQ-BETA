import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../api";
import type { AdminSummary } from "../types";
import { AdminPage } from "./AdminPage";

vi.mock("../api", () => ({
  adminApi: {
    me: vi.fn(), dashboard: vi.fn(), jobs: vi.fn(), listeningSets: vi.fn(), setEmailEnabled: vi.fn(),
    readingSets: vi.fn(), responseSessions: vi.fn(), responseSession: vi.fn(),
    exportOptions: vi.fn(), exportPreview: vi.fn(), downloadExport: vi.fn(),
  },
}));
vi.mock("../supabase", () => ({ supabase: null }));

const summary: AdminSummary = {
  totalItems: 100, totalVersions: 100, readingVersions: 50, listeningVersions: 50,
  setCount: 2, mockTestCount: 2, publishedMockTests: 2, audioReady: 50,
  audioMissing: 0, visualReady: 4, jobsQueued: 0, jobsProcessing: 0,
  jobsFailed: 0, sessionsToday: 3, responseCount: 80,
  answeredResponseCount: 75, unansweredResponseCount: 5,
  emailUsage: {
    enabled: true, configured: true, cycleStart: "2026-09-11", cycleEnd: "2026-10-11",
    acceptedCount: 120, pendingCount: 0, limit: 5000, remaining: 4880,
    warningThreshold: 4990, warningStatus: "not_sent",
  },
};

describe("AdminPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unigate.topik.admin.token", "admin-token");
    vi.mocked(adminApi.me).mockResolvedValue({ admin: { id: "admin-1", email: "admin@example.com" } });
    vi.mocked(adminApi.dashboard).mockResolvedValue({ summary });
    vi.mocked(adminApi.jobs).mockResolvedValue({ jobs: [] });
    vi.mocked(adminApi.listeningSets).mockResolvedValue({ sets: [] });
    vi.mocked(adminApi.readingSets).mockResolvedValue({ sets: [] });
    vi.mocked(adminApi.responseSessions).mockResolvedValue({ sessions: [], total: 0 });
    vi.mocked(adminApi.setEmailEnabled).mockResolvedValue({ enabled: true, updatedAt: "2026-09-11T00:00:00Z" });
    vi.mocked(adminApi.exportOptions).mockResolvedValue({ mockTests: [], itemTypes: [] });
  });

  it("loads the dashboard and keeps response navigation available", async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "서비스 요약" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "사용자 응답" }));
    expect(screen.getByRole("heading", { name: "응시 세션별 사용자 응답" })).toBeInTheDocument();
    expect(adminApi.dashboard).toHaveBeenCalledWith("admin-token");
  });

  it("shows the Brevo cycle and turns new result mail off from the dashboard", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(adminApi.dashboard)
      .mockResolvedValueOnce({ summary })
      .mockResolvedValue({ summary: { ...summary, emailUsage: { ...summary.emailUsage, enabled: false } } });
    vi.mocked(adminApi.setEmailEnabled).mockResolvedValue({ enabled: false, updatedAt: "2026-09-11T00:00:00Z" });
    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByText("2026.09.11 ~ 2026.10.10 · 수신자 기준")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "결과 이메일 발송" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(adminApi.setEmailEnabled).toHaveBeenCalledWith("admin-token", false);
    expect(await screen.findByText("메일 OFF")).toBeInTheDocument();
  });

  it("shows the current Brevo cycle and can turn new result mail off", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "결과 이메일" })).toBeInTheDocument();
    expect(screen.getByText("2026.09.11 ~ 2026.10.10 · 수신자 기준")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "결과 이메일 발송" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(adminApi.setEmailEnabled).toHaveBeenCalledWith("admin-token", false);
  });

  it("shows the export guide and privacy details from the admin navigation", async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "서비스 요약" });
    await userEvent.click(screen.getByRole("button", { name: "데이터 추출" }));

    expect(screen.getByRole("heading", { name: "분석 데이터 추출" })).toBeInTheDocument();
    expect(screen.getByText("문항 분석 CSV")).toBeInTheDocument();
    expect(screen.getByText("사용자 응답 CSV")).toBeInTheDocument();
    expect(screen.getByText("응시 세션 요약 CSV")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "응답 데이터 저장 안내" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "문항 행동 이벤트" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "듣기 음원 재생" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "결과 이메일 전달" })).toBeInTheDocument();
    expect(screen.getByText(/이메일 결과 링크의 원본 토큰은 데이터베이스에 저장하지 않고/)).toBeInTheDocument();
    expect(screen.getByText(/결과 이메일과 음원 재생 기록은 함께 삭제/)).toBeInTheDocument();
  });
});
