import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type CleanupAssetType = "visual" | "audio";

export interface CleanupAsset {
  assetId: string;
  bucket: string;
  path: string;
}

export async function queueMediaCleanup(
  client: Pick<PoolClient, "query">,
  assetType: CleanupAssetType,
  assets: CleanupAsset[],
) {
  for (const asset of assets) {
    await client.query(
      `INSERT INTO topik_app.media_cleanup_jobs(
         cleanup_job_id,asset_type,asset_id,storage_bucket,storage_path
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), assetType, asset.assetId, asset.bucket, asset.path],
    );
  }
}

