import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResponseDeleteDialog } from "./ResponseDeleteDialog";

describe("ResponseDeleteDialog", () => {
  it("requires the abandoned-session confirmation phrase", async () => {
    const onConfirmationChange = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(<ResponseDeleteDialog
      dialog={{ mode: "abandoned" }} selectedCount={0} confirmation="" busy={false}
      onConfirmationChange={onConfirmationChange} onCancel={vi.fn()} onConfirm={onConfirm}
    />);

    expect(screen.getByRole("heading", { name: "폐기 세션 전체 삭제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "폐기 세션 전체 삭제");
    expect(onConfirmationChange).toHaveBeenCalled();

    rerender(<ResponseDeleteDialog
      dialog={{ mode: "abandoned" }} selectedCount={0} confirmation="폐기 세션 전체 삭제" busy={false}
      onConfirmationChange={onConfirmationChange} onCancel={vi.fn()} onConfirm={onConfirm}
    />);
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
