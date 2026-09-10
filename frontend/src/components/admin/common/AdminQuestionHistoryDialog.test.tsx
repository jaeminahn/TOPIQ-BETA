import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../../api";
import { AdminQuestionHistoryDialog } from "./AdminQuestionHistoryDialog";

vi.mock("../../../api", () => ({ adminApi: { questionVersions: vi.fn() } }));

describe("AdminQuestionHistoryDialog", () => {
  beforeEach(() => {
    vi.mocked(adminApi.questionVersions).mockResolvedValue({
      setId: "set-1", itemId: "item-1", position: 10, currentVersion: 2,
      versions: [
        { itemId: "item-1", itemVersion: 2, itemType: "grammar", targetLevel: 3, predictedDifficulty: 0,
          reviewStatus: "reviewed", stem: "최신 문제", choices: ["가", "나", "다", "라"], correctAnswer: 2,
          explanation: "최신 해설", contentJson: {}, createdAt: "2026-09-10T01:00:00.000Z", isCurrent: true },
        { itemId: "item-1", itemVersion: 1, itemType: "grammar", targetLevel: 3, predictedDifficulty: 0,
          reviewStatus: "reviewed", stem: "과거 문제", choices: ["가", "나", "다", "라"], correctAnswer: 1,
          explanation: "과거 해설", contentJson: {}, createdAt: "2026-09-09T01:00:00.000Z", isCurrent: false },
      ],
    });
  });

  it("shows newest versions first, marks the current version, and stays read-only", async () => {
    render(<AdminQuestionHistoryDialog token="token" setId="set-1" itemId="item-1" position={10} onClose={vi.fn()} />);

    await waitFor(() => expect(adminApi.questionVersions).toHaveBeenCalledWith("token", "set-1", "item-1"));
    const dialog = screen.getByRole("dialog");
    const headings = within(dialog).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["문항 v2", "문항 v1"]);
    expect(within(dialog).getByText("현재")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /수정|삭제|생성/ })).not.toBeInTheDocument();
  });
});
