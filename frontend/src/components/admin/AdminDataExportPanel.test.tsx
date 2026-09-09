import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../api";
import { AdminDataExportPanel } from "./AdminDataExportPanel";

vi.mock("../../api", () => ({
  adminApi: {
    exportOptions: vi.fn(),
    exportPreview: vi.fn(),
    downloadExport: vi.fn(),
  },
}));

describe("AdminDataExportPanel", () => {
  beforeEach(() => {
    vi.mocked(adminApi.exportOptions).mockResolvedValue({
      mockTests: [{
        mockTestId: "10000000-0000-4000-8000-000000000001",
        slug: "topik-ii-reading-1",
        titleKo: "TOPIK II 읽기 모의고사 1회",
        titleEn: "TOPIK II Reading Mock Test 1",
        isPublished: true,
      }],
      itemTypes: ["grammar_blank"],
    });
    vi.mocked(adminApi.exportPreview).mockResolvedValue({
      rowCount: 125,
      sessionCount: 3,
      filters: {
        status: "submitted", minAssignedCount: 0, outcome: "all", rating: "all", resultEmail: "all",
      },
      generatedAt: "2026-09-09T03:00:00.000Z",
    });
    vi.mocked(adminApi.downloadExport).mockResolvedValue({
      blob: new Blob(["csv"]), filename: "unigate_responses_20260909_120000_KST.csv",
    });
  });

  it("explains question accuracy and requires a fresh preview after filter changes", async () => {
    render(<AdminDataExportPanel token="admin-token" />);

    expect(screen.getByRole("heading", { name: "분석 데이터 추출" })).toBeInTheDocument();
    expect(screen.getByText(/응답자 기준 정답률/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV 다운로드" })).toBeDisabled();
    await screen.findByRole("option", { name: "TOPIK II 읽기 모의고사 1회" });

    await userEvent.click(screen.getByRole("button", { name: "추출 대상 확인" }));
    expect(await screen.findByText("125행을 추출할 예정입니다.")).toBeInTheDocument();
    expect(screen.getByText(/대상 세션 3개/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV 다운로드" })).toBeEnabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "시험" }), "10000000-0000-4000-8000-000000000001");
    expect(screen.queryByText("125행을 추출할 예정입니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV 다운로드" })).toBeDisabled();
  });

  it("offers unanswered filtering and downloads the previewed response CSV", async () => {
    const createObjectUrl = vi.fn(() => "blob:export");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<AdminDataExportPanel token="admin-token" />);

    await userEvent.click(screen.getByRole("radio", { name: /사용자 응답 CSV/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "응답 결과" }), "unanswered");
    await userEvent.click(screen.getByRole("button", { name: "추출 대상 확인" }));
    await screen.findByText("125행을 추출할 예정입니다.");
    await userEvent.click(screen.getByRole("button", { name: "CSV 다운로드" }));

    await waitFor(() => expect(adminApi.downloadExport).toHaveBeenCalledWith(
      "admin-token",
      "responses",
      expect.objectContaining({ status: "submitted", outcome: "unanswered" }),
    ));
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:export");
    click.mockRestore();
  });

  it("warns that session summaries include raw result email addresses", async () => {
    render(<AdminDataExportPanel token="admin-token" />);

    await userEvent.click(screen.getByRole("radio", { name: /응시 세션 요약 CSV/ }));

    expect(screen.getByText("개인정보: 이메일 원문 포함")).toBeInTheDocument();
    expect(screen.getByText("result_email").closest("p")).toHaveTextContent(/최신 Brevo 접수 완료 이메일 원문/);
    expect(screen.getByText(/다운로드한 파일은 개인정보 처리 기준/)).toBeInTheDocument();
  });
});
