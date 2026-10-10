import { act, fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { PageBoundary } from "./PageBoundary";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("page loading boundary", () => {
  it.each([
    ["ko", "화면을 불러오고 있습니다..."],
    ["en", "Loading page..."],
  ] as const)("shows a generic %s loading state until the page arrives", async (locale, message) => {
    let finish!: (page: { default: () => React.ReactNode }) => void;
    const Page = lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve; }));
    render(<MemoryRouter><I18nProvider locale={locale}><PageBoundary><Page /></PageBoundary></I18nProvider></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    await act(async () => { finish({ default: () => <h1>Loaded page</h1> }); });
    expect(screen.getByRole("heading", { name: "Loaded page" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a failed import on an error screen until retry and allows returning home", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const Page = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
    render(<MemoryRouter initialEntries={["/admin"]}><I18nProvider locale="ko">
      <PageBoundary><Routes>
        <Route path="/admin" element={<Page />} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes></PageBoundary>
    </I18nProvider></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("화면을 불러오지 못했습니다");
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: "처음으로" }));
    expect(await screen.findByRole("heading", { name: "Home page" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
