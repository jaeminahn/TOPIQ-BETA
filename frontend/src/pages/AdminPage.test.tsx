import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../api";
import type { AdminSummary } from "../types";
import { AdminPage } from "./AdminPage";

vi.mock("../api", () => ({
  adminApi: {
    me: vi.fn(), dashboard: vi.fn(), jobs: vi.fn(), listeningSets: vi.fn(),
    readingSets: vi.fn(), responseSessions: vi.fn(), responseSession: vi.fn(),
  },
}));
vi.mock("../supabase", () => ({ supabase: null }));

const summary: AdminSummary = {
  totalItems: 100, totalVersions: 100, readingVersions: 50, listeningVersions: 50,
  setCount: 2, mockTestCount: 2, publishedMockTests: 2, audioReady: 50,
  audioMissing: 0, visualReady: 4, jobsQueued: 0, jobsProcessing: 0,
  jobsFailed: 0, sessionsToday: 3, responseCount: 80,
  answeredResponseCount: 75, unansweredResponseCount: 5,
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
  });

  it("loads the dashboard and keeps response navigation available", async () => {
    render(<MemoryRouter><AdminPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "서비스 요약" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "사용자 응답" }));
    expect(screen.getByRole("heading", { name: "응시 세션별 사용자 응답" })).toBeInTheDocument();
    expect(adminApi.dashboard).toHaveBeenCalledWith("admin-token");
  });
});
