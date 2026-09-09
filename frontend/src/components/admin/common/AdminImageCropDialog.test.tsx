import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminImageCropDialog } from "./AdminImageCropDialog";

describe("AdminImageCropDialog", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:crop-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("cancels without producing an upload and restores the previous focus", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const previous = document.createElement("button");
    document.body.append(previous);
    previous.focus();
    const { unmount } = render(<AdminImageCropDialog file={new File(["image"], "graph.png", { type: "image/png" })} title="10번 그래프 크롭" onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    unmount();
    expect(previous).toHaveFocus();
    previous.remove();
  });

  it("creates a 4:3 WebP only after confirmation", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["cropped"], { type: "image/webp" }));
    });
    const onConfirm = vi.fn();
    render(<AdminImageCropDialog file={new File(["image"], "choice.jpg", { type: "image/jpeg" })} title="1번 보기 크롭" onCancel={vi.fn()} onConfirm={onConfirm} />);
    const preview = document.querySelector<HTMLImageElement>('img[alt="크롭할 이미지 미리보기"]')!;
    Object.defineProperties(preview, {
      naturalWidth: { configurable: true, value: 2_400 },
      naturalHeight: { configurable: true, value: 1_200 },
    });
    fireEvent.load(preview);

    const confirm = await screen.findByRole("button", { name: "크롭 후 업로드" });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ name: "choice-cropped.webp", type: "image/webp" });
  });
});
