import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../api";
import type { AdminReadingItem, AdminReadingSet } from "../../types";
import { ReadingAdminPanel } from "./ReadingAdminPanel";

vi.mock("../../api", () => ({
  adminApi: { readingItems: vi.fn() },
}));

const linkedSet: AdminReadingSet = {
  setId: "10000000-0000-4000-8000-000000000001", setVersion: 1, setSequence: 1,
  createdAt: "2026-08-10T12:00:00.000Z", reviewStatus: "reviewed", publishedAt: "2026-08-10T12:00:00.000Z",
  itemCount: 50, validItemCount: 50, mockTestId: "20000000-0000-4000-8000-000000000001",
  slug: "topik-ii-reading-1", titleKo: "TOPIK II 읽기 모의고사 1회", mockTestPublished: true,
  round: 1, readyToPublish: false, blockingReasons: [],
};

const pendingSet: AdminReadingSet = {
  ...linkedSet,
  setId: "10000000-0000-4000-8000-000000000003", setSequence: 2, createdAt: "2026-08-11T12:00:00.000Z",
  mockTestId: null, slug: null, titleKo: null, mockTestPublished: null, round: null, readyToPublish: true,
};

const item: AdminReadingItem = {
  setId: linkedSet.setId, setVersion: 1, position: 1, mockTestTitle: linkedSet.titleKo,
  itemId: "30000000-0000-4000-8000-000000000001", itemVersion: 1, itemType: "grammar_blank",
  targetLevel: 3, predictedDifficulty: 0.5, reviewStatus: "reviewed", stem: "첫 번째 읽기 문제",
  choices: ["하나", "둘", "셋", "넷"], correctAnswer: 1, explanation: "해설", contentJson: {},
};

describe("ReadingAdminPanel", () => {
  beforeEach(() => {
    vi.mocked(adminApi.readingItems).mockReset();
    vi.mocked(adminApi.readingItems).mockResolvedValue({ items: [item] });
  });

  it("shows rounds first and loads only the selected set's items", async () => {
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet, pendingSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);

    expect(screen.getAllByTestId("reading-set-card")).toHaveLength(2);
    expect(screen.queryByText("첫 번째 읽기 문제")).not.toBeInTheDocument();
    const linkedCard = screen.getAllByTestId("reading-set-card")[0];
    await userEvent.click(within(linkedCard).getByRole("button", { name: "문항 보기" }));

    await waitFor(() => expect(adminApi.readingItems).toHaveBeenCalledWith("admin-token", { setId: linkedSet.setId }));
    expect(await screen.findAllByText("첫 번째 읽기 문제")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "읽기 1회 · 개별 문항" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "회차 목록" }));
    expect(screen.getAllByTestId("reading-set-card")).toHaveLength(2);
  });

  it("publishes a ready unlinked set from its card", async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet, pendingSet]} busy="" onPublish={onPublish} onError={vi.fn()} />);

    const pendingCard = screen.getAllByTestId("reading-set-card")[1];
    expect(within(pendingCard).getByText("홈페이지 추가 준비 완료")).toBeInTheDocument();
    await userEvent.click(within(pendingCard).getByRole("button", { name: /홈페이지에 추가/ }));
    expect(onPublish).toHaveBeenCalledWith(pendingSet);
  });
});
