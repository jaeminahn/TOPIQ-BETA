import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../../api";
import type { AdminPreregistration } from "../../../types";
import { AdminPreregistrationsPanel } from "./AdminPreregistrationsPanel";

vi.mock("../../../api", () => ({ adminApi: { preregistrations: vi.fn(), downloadPreregistrations: vi.fn(), deletePreregistration: vi.fn() } }));
const application: AdminPreregistration = {
  registrationId: "001-00000002", email: "Test@Example.com", source: "landing", sourceCode: "001",
  consentedAt: "2026-10-01T01:00:00Z", locale: "ko", privacyConsent: true, marketingConsent: true, consentVersion: "preregistration_v1",
};
const listing = (registrations = [application], total = registrations.length, page = 1) => ({ registrations, total, page, pageSize: 50 });

describe("admin preregistrations", () => {
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    vi.mocked(adminApi.preregistrations).mockReset().mockResolvedValue(listing());
    vi.mocked(adminApi.deletePreregistration).mockReset().mockResolvedValue(undefined);
    vi.mocked(adminApi.downloadPreregistrations).mockReset().mockResolvedValue({ blob: new Blob(["csv"]), filename: "preregistrations.csv" });
  });

  it("applies filters to the list and exports all matching pages", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(<AdminPreregistrationsPanel token="admin-token" />);
      await screen.findByText(application.email);
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "유입 경로" }), "landing");
      await userEvent.click(screen.getByRole("checkbox", { name: /이메일 중복 제거/ }));
      fireEvent.change(screen.getByLabelText("시작일 (KST)"), { target: { value: "2026-10-01" } });
      fireEvent.change(screen.getByLabelText("종료일 (KST)"), { target: { value: "2026-10-02" } });
      await userEvent.type(screen.getByRole("searchbox", { name: "이메일 검색" }), "Test@");
      expect(screen.getByRole("button", { name: "CSV 다운로드" })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "필터 적용" }));
      await waitFor(() => expect(adminApi.preregistrations).toHaveBeenLastCalledWith("admin-token", {
        source: "landing", deduplicate: true, from: "2026-10-01", to: "2026-10-02", search: "Test@",
      }, 1));
      await userEvent.click(screen.getByRole("button", { name: "CSV 다운로드" }));
      expect(adminApi.downloadPreregistrations).toHaveBeenCalledWith("admin-token", {
        source: "landing", deduplicate: true, from: "2026-10-01", to: "2026-10-02", search: "Test@",
      });
      expect(click).toHaveBeenCalled(); expect(revokeUrl).toHaveBeenCalledWith("blob:test");
    } finally { createUrl.mockRestore(); revokeUrl.mockRestore(); click.mockRestore(); }
  });

  it("cancels deletion and confirms only the displayed application with a duplicate warning", async () => {
    render(<AdminPreregistrationsPanel token="admin-token" />);
    await screen.findByText(application.email);
    await userEvent.click(screen.getByRole("checkbox", { name: /이메일 중복 제거/ }));
    await userEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    const opener = await screen.findByRole("button", { name: `${application.registrationId} 신청 삭제` });
    await userEvent.click(opener);
    let dialog = screen.getByRole("dialog", { name: "사전등록 신청 삭제" });
    expect(within(dialog).getByText(application.email)).toBeInTheDocument();
    expect(within(dialog).getByText(/이전 신청이 있으면/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(adminApi.deletePreregistration).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    await userEvent.click(opener);
    dialog = screen.getByRole("dialog");
    vi.mocked(adminApi.preregistrations).mockResolvedValue(listing([{ ...application, registrationId: "001-00000001" }]));
    await userEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    await screen.findByText("001-00000001");
    expect(adminApi.deletePreregistration).toHaveBeenCalledWith("admin-token", "001-00000002");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the record and dialog after failure and blocks repeated clicks while deleting", async () => {
    vi.mocked(adminApi.deletePreregistration).mockRejectedValueOnce(new Error("Delete failed"));
    render(<AdminPreregistrationsPanel token="admin-token" />);
    await userEvent.click(await screen.findByRole("button", { name: `${application.registrationId} 신청 삭제` }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("삭제하지 못했습니다");
    expect(screen.getAllByText(application.email)).toHaveLength(2);
    let resolve!: () => void;
    vi.mocked(adminApi.deletePreregistration).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await userEvent.dblClick(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }));
    expect(adminApi.deletePreregistration).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "삭제 중..." })).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("returns to the previous page when deleting the last row", async () => {
    vi.mocked(adminApi.preregistrations)
      .mockResolvedValueOnce(listing([application], 51))
      .mockResolvedValueOnce(listing([application], 51, 2))
      .mockResolvedValueOnce(listing([], 50, 2))
      .mockResolvedValue(listing([{ ...application, registrationId: "001-00000001" }], 50));
    render(<AdminPreregistrationsPanel token="admin-token" />);
    await screen.findByText(application.email);
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("2 / 2");
    await userEvent.click(await screen.findByRole("button", { name: `${application.registrationId} 신청 삭제` }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }));
    await screen.findByText("001-00000001");
    expect(adminApi.preregistrations).toHaveBeenLastCalledWith("admin-token", { deduplicate: false, search: "" }, 1);
  });
});
