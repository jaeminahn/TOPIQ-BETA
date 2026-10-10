import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSequentialGeneration } from "./useSequentialGeneration";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("sequential media generation", () => {
  it("waits for each request, continues failures, and retries only failed tasks manually", async () => {
    const { result } = renderHook(useSequentialGeneration);
    const pending = deferred();
    const first = vi.fn(() => pending.promise);
    const second = vi.fn().mockRejectedValueOnce(new Error("provider down")).mockResolvedValue(undefined);
    const third = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    let running!: Promise<void>;
    act(() => { running = result.current.run([{key:"a",run:first},{key:"b",run:second},{key:"c",run:third}],refresh); });
    expect(second).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(); await running; });
    expect(third).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({total:3,completed:2,failed:1,running:false,errors:{b:"provider down"}});
    expect(second).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.retry(refresh); });
    expect(first).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({total:1,completed:1,failed:0,errors:{}});
  });

  it.each(["reset", "unmount"])("stops dispatching remaining requests after %s", async (mode) => {
    const { result, unmount } = renderHook(useSequentialGeneration);
    const pending = deferred(), next = vi.fn(), refresh = vi.fn();
    let running!: Promise<void>;
    act(() => { running = result.current.run([{key:"a",run:()=>pending.promise},{key:"b",run:next}],refresh); });
    act(() => { if (mode === "reset") result.current.reset(); else unmount(); });
    await act(async () => { pending.resolve(); await running; });
    expect(next).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("recognizes a saved asset after a lost response and does not generate it again", async () => {
    const { result } = renderHook(useSequentialGeneration);
    let saved = false;
    const run = vi.fn().mockRejectedValue(new Error("connection lost"));
    const refresh = vi.fn(async () => { saved = true; });
    await act(async () => { await result.current.run([{key:"a",run,isComplete:()=>saved}],refresh); });
    expect(result.current).toMatchObject({completed:1,failed:0,errors:{}});
    await act(async () => { await result.current.retry(refresh); });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
