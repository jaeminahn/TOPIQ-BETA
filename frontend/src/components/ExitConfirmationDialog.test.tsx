import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ExitConfirmationDialog } from "./ExitConfirmationDialog";

describe("ExitConfirmationDialog", () => {
  it("shows answered and remaining counts and keeps the user on Escape", async () => {
    const stay = vi.fn();
    render(<I18nProvider><ExitConfirmationDialog open variant="test" answered={13} total={50} onStay={stay} onLeave={vi.fn()} /></I18nProvider>);
    expect(screen.getByText(/13문제를 풀었고 37문제가 남았습니다/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(stay).toHaveBeenCalled();
  });

  it("uses result-specific retention copy", () => {
    render(<I18nProvider><ExitConfirmationDialog open variant="results" onStay={vi.fn()} onLeave={vi.fn()} /></I18nProvider>);
    expect(screen.getByRole("button", { name: "결과 계속 보기" })).toBeInTheDocument();
    expect(screen.getByText(/시험 결과는 저장/)).toBeInTheDocument();
  });
});
