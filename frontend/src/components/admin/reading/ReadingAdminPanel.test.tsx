import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../../api";
import type { AdminReadingItem, AdminReadingSet } from "../../../types";
import { ReadingAdminPanel } from "./ReadingAdminPanel";

vi.mock("../../../api", () => ({
  adminApi: {
    readingItems: vi.fn(), generateReadingMaterial: vi.fn(), generateReadingSetVisuals: vi.fn(),
    uploadReadingMaterial: vi.fn(), deleteReadingMaterial: vi.fn(), questionVersions: vi.fn(),
  },
}));
vi.mock("../common/AdminImageCropDialog", () => ({
  AdminImageCropDialog: ({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (file: File) => void }) => <div role="dialog"><h2>{title}</h2><button onClick={onCancel}>크롭 취소</button><button onClick={() => onConfirm(new File(["cropped"], "cropped.webp", { type: "image/webp" }))}>크롭 후 업로드</button></div>,
}));

const linkedSet: AdminReadingSet = {
  setId: "10000000-0000-4000-8000-000000000001", setSequence: 1,
  createdAt: "2026-08-10T12:00:00.000Z", reviewStatus: "reviewed", publishedAt: "2026-08-10T12:00:00.000Z",
  itemCount: 50, validItemCount: 50, visualRequired: 1, visualReady: 1, mockTestId: "20000000-0000-4000-8000-000000000001",
  slug: "topik-ii-reading-1", titleKo: "TOPIK II 읽기 모의고사 1회", mockTestPublished: true,
  round: 1, readyToPublish: false, blockingReasons: [],
};

const pendingSet: AdminReadingSet = {
  ...linkedSet,
  setId: "10000000-0000-4000-8000-000000000003", setSequence: 2, createdAt: "2026-08-11T12:00:00.000Z",
  mockTestId: null, slug: null, titleKo: null, mockTestPublished: null, round: null, readyToPublish: true,
};

const item: AdminReadingItem = {
  setId: linkedSet.setId, position: 1, mockTestTitle: linkedSet.titleKo,
  itemId: "30000000-0000-4000-8000-000000000001", itemVersion: 1, itemType: "grammar_blank",
  targetLevel: 3, predictedDifficulty: 0.5, reviewStatus: "reviewed", stem: "첫 번째 읽기 문제",
  choices: ["하나", "둘", "셋", "넷"], correctAnswer: 1, explanation: "해설", contentJson: {}, visualOptions: [],
  materialVisual: null,
};

describe("ReadingAdminPanel", () => {
  beforeEach(() => {
    vi.mocked(adminApi.readingItems).mockReset();
    vi.mocked(adminApi.readingItems).mockResolvedValue({ items: [item] });
    vi.mocked(adminApi.generateReadingMaterial).mockReset();
    vi.mocked(adminApi.generateReadingMaterial).mockResolvedValue({ queued: true, jobId: "job-1" });
    vi.mocked(adminApi.generateReadingSetVisuals).mockReset();
    vi.mocked(adminApi.generateReadingSetVisuals).mockResolvedValue({ queued: 1, jobIds: ["job-1"] });
    vi.mocked(adminApi.uploadReadingMaterial).mockReset();
    vi.mocked(adminApi.uploadReadingMaterial).mockResolvedValue({ visualAssetId: "asset-2", url: "https://example.com/new.png" });
    vi.mocked(adminApi.deleteReadingMaterial).mockReset();
    vi.mocked(adminApi.deleteReadingMaterial).mockResolvedValue({ deleted: true, storageDeleted: true });
    vi.mocked(adminApi.questionVersions).mockReset();
    vi.mocked(adminApi.questionVersions).mockResolvedValue({ setId: item.setId, itemId: item.itemId, position: item.position, currentVersion: 1, versions: [] });
  });

  it("copies a normalized reading visual generation prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(adminApi.readingItems).mockResolvedValue({ items: [{
      ...item,
      visualOptions: [{ optionNumber: 1, description: "선그래프", imagePrompt: "흑백 선그래프를 생성", chartSpec: { chart_type: "line" } }],
    }] });
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click((await screen.findAllByText("첫 번째 읽기 문제"))[0]!);
    await userEvent.click(screen.getByRole("button", { name: "1번 1번 보기 생성 프롬프트 복사" }));

    expect(writeText).toHaveBeenCalledWith("흑백 선그래프를 생성");
    expect(await screen.findByText("복사됨")).toHaveClass("sr-only");
  });

  it("shows rounds first and loads only the selected set's items", async () => {
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet, pendingSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);

    expect(screen.getAllByTestId("reading-set-card")).toHaveLength(2);
    expect(screen.queryByText("첫 번째 읽기 문제")).not.toBeInTheDocument();
    const linkedCard = screen.getAllByTestId("reading-set-card")[0];
    await userEvent.click(within(linkedCard).getByRole("button", { name: "문항 보기" }));

    await waitFor(() => expect(adminApi.readingItems).toHaveBeenCalledWith("admin-token", { setId: linkedSet.setId }));
    expect(await screen.findAllByText("첫 번째 읽기 문제")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "읽기 1회 · 문항 관리" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "회차 목록" }));
    expect(screen.getAllByTestId("reading-set-card")).toHaveLength(2);
  });

  it("opens read-only version history from the selected question", async () => {
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "1번 버전 이력" }));

    expect(await screen.findByRole("heading", { name: "1번 문항 버전 이력" })).toBeInTheDocument();
    expect(adminApi.questionVersions).toHaveBeenCalledWith("admin-token", linkedSet.setId, item.itemId);
  });

  it("renders highlight_text as an actual underline in the admin question detail", async () => {
    vi.mocked(adminApi.readingItems).mockResolvedValue({ items: [{
      ...item,
      stem: "박물관은 관람객의 편의를 높이고자 표지판을 설치했다.",
      contentJson: { highlight_text: "높이고자" },
    }] });
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click((await screen.findAllByText(/박물관은 관람객의 편의를/))[0]!);

    const highlight = screen.getByTestId("inline-highlight");
    expect(highlight.tagName).toBe("U");
    expect(highlight).toHaveTextContent("높이고자");
    expect(highlight).toHaveClass("font-normal", "underline-offset-4");
  });

  it("uses the shared round labels and status presentation", () => {
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet, pendingSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByText("등록 회차 1")).toBeInTheDocument();
    expect(screen.getByText("새 세트 1")).toBeInTheDocument();
    expect(screen.getByText("공개")).toBeInTheDocument();
    expect(screen.getByText("미등록")).toBeInTheDocument();
    expect(screen.getAllByText("유효")).toHaveLength(2);
  });

  it("publishes a ready unlinked set from its card", async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet, pendingSet]} busy="" onPublish={onPublish} onError={vi.fn()} />);

    const pendingCard = screen.getAllByTestId("reading-set-card")[1];
    expect(within(pendingCard).getByText("홈페이지 추가 준비 완료")).toBeInTheDocument();
    await userEvent.click(within(pendingCard).getByRole("button", { name: /홈페이지에 추가/ }));
    expect(onPublish).toHaveBeenCalledWith(pendingSet);
  });

  it("confirms before making a published round private", async () => {
    const onTogglePublish = vi.fn().mockResolvedValue(undefined);
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet]} busy="" onPublish={vi.fn()} onTogglePublish={onTogglePublish} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "비공개 전환" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("이 회차를 비공개로 전환할까요?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "비공개 전환" }));
    await waitFor(() => expect(onTogglePublish).toHaveBeenCalledWith(linkedSet));
  });

  it("generates, copies, uploads, and deletes the position 10 graph material", async () => {
    const graphItem: AdminReadingItem = {
      ...item,
      position: 10,
      materialVisual: {
        description: "교통수단 이용률 그래프",
        imagePrompt: "정확한 수치로 흑백 막대그래프 생성",
        sourceText: "버스 34%, 지하철 28%",
        visualAssetId: "asset-1",
        imageUrl: "https://example.com/graph.png",
        generationStatus: "succeeded",
        generationError: null,
      },
    };
    vi.mocked(adminApi.readingItems).mockResolvedValue({ items: [graphItem] });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSetsChanged = vi.fn().mockResolvedValue(undefined);
    render(<ReadingAdminPanel token="admin-token" sets={[linkedSet]} busy="" onPublish={vi.fn()} onSetsChanged={onSetsChanged} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click((await screen.findAllByText("첫 번째 읽기 문제"))[0]!);

    expect(screen.getByRole("img", { name: "교통수단 이용률 그래프" })).toHaveAttribute("src", "https://example.com/graph.png");
    await userEvent.click(screen.getByRole("button", { name: "10번 그래프 생성 프롬프트 복사" }));
    expect(writeText).toHaveBeenCalledWith("정확한 수치로 흑백 막대그래프 생성");

    await userEvent.click(screen.getByRole("button", { name: "다시 생성" }));
    await waitFor(() => expect(adminApi.generateReadingMaterial).toHaveBeenCalledWith("admin-token", graphItem.itemId, 1, true));

    const upload = screen.getByLabelText("10번 그래프 업로드").querySelector("input")!;
    await userEvent.upload(upload, new File(["image"], "graph.png", { type: "image/png" }));
    expect(screen.getByRole("heading", { name: "10번 그래프 크롭" })).toBeInTheDocument();
    expect(adminApi.uploadReadingMaterial).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "크롭 취소" }));
    expect(adminApi.uploadReadingMaterial).not.toHaveBeenCalled();
    await userEvent.upload(upload, new File(["image-2"], "graph.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "크롭 후 업로드" }));
    await waitFor(() => expect(adminApi.uploadReadingMaterial).toHaveBeenCalledWith("admin-token", graphItem.itemId, 1, expect.any(File)));

    await userEvent.click(screen.getByRole("button", { name: "10번 그래프 삭제" }));
    await waitFor(() => expect(adminApi.deleteReadingMaterial).toHaveBeenCalledWith("admin-token", graphItem.itemId, 1, "asset-1"));
    expect(confirm).toHaveBeenCalled();
  });

  it("queues only missing graphs from the set action", async () => {
    const missingSet = { ...linkedSet, visualReady: 0 };
    render(<ReadingAdminPanel token="admin-token" sets={[missingSet]} busy="" onPublish={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "문항 보기" }));
    await userEvent.click(await screen.findByRole("button", { name: /누락 그래프 생성/ }));
    await waitFor(() => expect(adminApi.generateReadingSetVisuals).toHaveBeenCalledWith("admin-token", missingSet.setId));
  });
});
