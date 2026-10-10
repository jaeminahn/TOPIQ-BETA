import type { PoolClient } from "pg";
import { SupabaseStorage } from "./storage.js";

export type RemoveMediaObject = (bucket: string, path: string) => Promise<void>;
type Asset = { storage_bucket: string; storage_path: string; is_current?: boolean };

// Called only after the replacement has committed. A failed deletion leaves the
// old asset in place; there is no persistent queue or automatic retry.
export async function cleanupReplacedMedia(
  client: Pick<PoolClient, "query">,
  type: "visual" | "audio",
  assetIds: string[],
  removeObject: RemoveMediaObject = (bucket, path) =>
    new SupabaseStorage(AbortSignal.timeout(10_000)).removeObject(bucket, path),
) {
  for (const assetId of new Set(assetIds)) {
    try {
      await client.query("BEGIN");
      if (type === "visual") await cleanupVisual(client, assetId, removeObject);
      else await cleanupAudio(client, assetId, removeObject);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Replaced media deletion failed", { type, assetId, error });
    }
  }
}

async function cleanupVisual(client: Pick<PoolClient, "query">, assetId: string, removeObject: RemoveMediaObject) {
  const asset = (await client.query<Asset>(
    `SELECT storage_bucket,storage_path,is_current FROM topik_app.item_visual_assets
      WHERE visual_asset_id=$1 FOR UPDATE`, [assetId],
  )).rows[0];
  if (!asset || asset.is_current) return;
  const shared = await client.query(
    `SELECT 1 FROM topik_app.item_visual_assets
      WHERE storage_bucket=$1 AND storage_path=$2 AND visual_asset_id<>$3 AND is_current LIMIT 1`,
    [asset.storage_bucket, asset.storage_path, assetId],
  );
  if (!shared.rowCount) await removeObject(asset.storage_bucket, asset.storage_path);
  await client.query("DELETE FROM topik_app.item_visual_assets WHERE visual_asset_id=$1", [assetId]);
}

async function cleanupAudio(client: Pick<PoolClient, "query">, assetId: string, removeObject: RemoveMediaObject) {
  const asset = (await client.query<Asset>(
    `SELECT storage_bucket,storage_path FROM topik_app.tts_audio_assets
      WHERE audio_asset_id=$1 AND deleted_at IS NULL FOR UPDATE`, [assetId],
  )).rows[0];
  if (!asset) return;
  const current = await client.query(
    `SELECT 1 FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1 AND is_current
     UNION ALL
     SELECT 1 FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1 AND is_current LIMIT 1`,
    [assetId],
  );
  if (current.rowCount) return;
  const shared = await client.query(
    `SELECT 1 FROM topik_app.tts_audio_assets shared
      WHERE shared.storage_bucket=$1 AND shared.storage_path=$2 AND shared.audio_asset_id<>$3
        AND shared.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM topik_app.item_audio_bindings binding
            WHERE binding.audio_asset_id=shared.audio_asset_id AND binding.is_current)
          OR EXISTS (SELECT 1 FROM topik_app.question_set_item_audio_bindings binding
            WHERE binding.audio_asset_id=shared.audio_asset_id AND binding.is_current)
        ) LIMIT 1`,
    [asset.storage_bucket, asset.storage_path, assetId],
  );
  if (!shared.rowCount) await removeObject(asset.storage_bucket, asset.storage_path);
  await client.query("DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1", [assetId]);
  await client.query("DELETE FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1", [assetId]);
  const playback = await client.query(
    "SELECT 1 FROM topik_app.audio_playback_events WHERE audio_asset_id=$1 LIMIT 1", [assetId],
  );
  if (playback.rowCount) {
    await client.query(
      "UPDATE topik_app.tts_audio_assets SET deleted_at=CURRENT_TIMESTAMP,storage_url='' WHERE audio_asset_id=$1",
      [assetId],
    );
  } else {
    await client.query("DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1", [assetId]);
  }
}
