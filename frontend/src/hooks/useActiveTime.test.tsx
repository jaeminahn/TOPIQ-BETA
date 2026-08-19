import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useActiveTime } from "./useActiveTime";

vi.mock("../api", () => ({ api: { event: vi.fn().mockResolvedValue({ accepted: true, submitted: false }) } }));

describe("useActiveTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.event).mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => vi.useRealTimers());

  it("flushes heartbeats and moves elapsed time into an answer without double counting", () => {
    const { result, unmount } = renderHook(() => useActiveTime("session-1", "token", 4, true));
    expect(api.event).toHaveBeenCalledWith("session-1", "token", 4, "presented", 0);

    act(() => vi.advanceTimersByTime(15_000));
    expect(api.event).toHaveBeenLastCalledWith("session-1", "token", 4, "heartbeat", expect.any(Number));
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.takeDuration()).toBeGreaterThanOrEqual(2_000);
    unmount();
    expect(api.event).toHaveBeenLastCalledWith("session-1", "token", 4, "hidden", expect.any(Number));
  });

  it("flushes when the page is hidden or pagehide fires", () => {
    const { unmount } = renderHook(() => useActiveTime("session-1", "token", 2, true));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(api.event).toHaveBeenLastCalledWith("session-1", "token", 2, "hidden", expect.any(Number));
    act(() => window.dispatchEvent(new Event("pagehide")));
    unmount();
  });
});
