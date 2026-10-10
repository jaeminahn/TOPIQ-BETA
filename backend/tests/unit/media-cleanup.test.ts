import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupReplacedMedia } from "../../src/media/cleanup.js";

function setup(type: "visual" | "audio", options: { current?: boolean; shared?: boolean; playback?: boolean; missing?: boolean } = {}) {
  const operations: string[] = [];
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    operations.push(sql);
    if (sql.includes("FOR UPDATE")) return {
      rows: options.missing ? [] : [{ storage_bucket: "media", storage_path: `${type}/old-file`, is_current: options.current ?? false }],
      rowCount: options.missing ? 0 : 1,
    };
    if (sql.includes("UNION ALL")) return { rows: [], rowCount: options.current ? 1 : 0 };
    if (sql.includes("storage_bucket=$1")) return { rows: [], rowCount: options.shared ? 1 : 0 };
    if (sql.includes("audio_playback_events")) return { rows: [], rowCount: options.playback ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  });
  const removeObject = vi.fn(async (_bucket: string, _path: string) => { operations.push("storage-delete"); });
  return { query, removeObject, operations };
}

afterEach(() => vi.restoreAllMocks());

describe("direct replaced media cleanup", () => {
  it.each(["visual", "audio"] as const)("deletes %s storage before its metadata", async (type) => {
    const { query, removeObject, operations } = setup(type);
    await cleanupReplacedMedia({ query } as never, type, ["asset-1", "asset-1"], removeObject);
    expect(removeObject).toHaveBeenCalledExactlyOnceWith("media", `${type}/old-file`);
    const firstDelete = operations.findIndex((sql) => sql.startsWith("DELETE"));
    expect(firstDelete).toBeGreaterThan(operations.indexOf("storage-delete"));
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it.each(["visual", "audio"] as const)("leaves %s metadata and bindings unchanged on storage failure", async (type) => {
    const { query, removeObject } = setup(type);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    removeObject.mockRejectedValue(new Error("storage unavailable"));
    await expect(cleanupReplacedMedia({ query } as never, type, ["asset-1"], removeObject)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(query.mock.calls.some(([sql]) => /^(DELETE|UPDATE|INSERT)/.test(sql))).toBe(false);
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it.each(["visual", "audio"] as const)("keeps a current %s asset", async (type) => {
    const { query, removeObject } = setup(type, { current: true });
    await cleanupReplacedMedia({ query } as never, type, ["asset-1"], removeObject);
    expect(removeObject).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => /^(DELETE|UPDATE|INSERT)/.test(sql))).toBe(false);
  });

  it.each(["visual", "audio"] as const)("preserves shared %s storage", async (type) => {
    const { query, removeObject } = setup(type, { shared: true });
    await cleanupReplacedMedia({ query } as never, type, ["asset-1"], removeObject);
    expect(removeObject).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(true);
  });

  it("keeps the audio asset as a tombstone when playback history exists", async () => {
    const { query, removeObject } = setup("audio", { playback: true });
    await cleanupReplacedMedia({ query } as never, "audio", ["asset-1"], removeObject);
    expect(removeObject).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET deleted_at=CURRENT_TIMESTAMP,storage_url=''"), ["asset-1"]);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("DELETE FROM topik_app.tts_audio_assets"))).toBe(false);
  });

  it.each(["visual", "audio"] as const)("does not delete storage for a missing %s asset", async (type) => {
    const { query, removeObject } = setup(type, { missing: true });
    await cleanupReplacedMedia({ query } as never, type, ["asset-1"], removeObject);
    expect(removeObject).not.toHaveBeenCalled();
  });
});
