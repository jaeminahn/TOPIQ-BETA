import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AdminPromptCopyButton } from "./AdminPromptCopyButton";

it("reports clipboard failures without showing a false success", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("복사 권한이 없습니다.")) },
  });
  const onError = vi.fn();
  render(<AdminPromptCopyButton prompt="생성 프롬프트" ariaLabel="프롬프트 복사" onError={onError} />);

  const button = screen.getByRole("button", { name: "프롬프트 복사" });
  expect(button).toHaveClass("size-9");
  expect(button.querySelector("svg")).toBeInTheDocument();
  await userEvent.click(button);
  expect(onError).toHaveBeenCalledWith("복사 권한이 없습니다.");
  expect(screen.getByText("복사 실패")).toHaveClass("sr-only");
  expect(screen.queryByText("복사됨")).not.toBeInTheDocument();
});
