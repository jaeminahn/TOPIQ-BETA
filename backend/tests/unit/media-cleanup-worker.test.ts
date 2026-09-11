import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from "../../src/db.js";
import { MediaCleanupWorker } from "../../src/media-cleanup-worker.js";

const poolMock = pool as unknown as {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
};

function cleanupJob(assetType: "visual" | "audio") {
  return {
    cleanup_job_id: "cleanup-1",
    asset_type: assetType,
    asset_id: "asset-1",
    storage_bucket: "media",
    storage_path: `${assetType}/old-file.bin`,
    attempts: 1,
  };
}

describe("media cleanup worker", () => {
  beforeEach(() => {
    poolMock.query.mockReset();
    poolMock.connect.mockReset();
  });

  it("removes a replaced visual object before deleting its metadata", async () => {
    const operations: string[] = [];
    poolMock.query
      .mockResolvedValueOnce({ rows: [cleanupJob("visual")], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT is_current")) return { rows: [{ is_current: false }], rowCount: 1 };
      if (sql.includes("storage_bucket=$1")) return { rows: [], rowCount: 0 };
      if (sql.includes("DELETE FROM topik_app.item_visual_assets")) operations.push("metadata-delete");
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });
    const removeObject = vi.fn(async () => { operations.push("storage-delete"); });

    await new MediaCleanupWorker(() => ({ removeObject }) as never).runOnce();

    expect(removeObject).toHaveBeenCalledWith("media", "visual/old-file.bin");
    expect(operations).toEqual(["storage-delete", "metadata-delete"]);
  });

  it("removes obsolete audio storage and keeps a tombstone when playback history exists", async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [cleanupJob("audio")], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("tts_audio_assets WHERE audio_asset_id=$1 FOR UPDATE")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("item_audio_bindings") && sql.includes("UNION ALL")) return { rows: [], rowCount: 0 };
      if (sql.includes("storage_bucket=$1")) return { rows: [], rowCount: 0 };
      if (sql.includes("audio_playback_events")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });
    const removeObject = vi.fn().mockResolvedValue(undefined);

    await new MediaCleanupWorker(() => ({ removeObject }) as never).runOnce();

    expect(removeObject).toHaveBeenCalledWith("media", "audio/old-file.bin");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET deleted_at=CURRENT_TIMESTAMP,storage_url=''"))).toBe(true);
  });

  it("waits without deleting when an audio asset is still current anywhere", async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [cleanupJob("audio")], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("tts_audio_assets WHERE audio_asset_id=$1 FOR UPDATE")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("item_audio_bindings") && sql.includes("UNION ALL")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });
    const removeObject = vi.fn().mockResolvedValue(undefined);

    await new MediaCleanupWorker(() => ({ removeObject }) as never).runOnce();

    expect(removeObject).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status='waiting'"))).toBe(true);
  });
});
