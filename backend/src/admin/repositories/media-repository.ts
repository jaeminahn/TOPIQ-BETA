import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../core/db.js";
import { MediaCommitUncertainError, notFound } from "../../core/errors.js";
import { cleanupReplacedMedia, type RemoveMediaObject } from "../../media/cleanup.js";
import { materialPromptSnapshot, normalizeReadingMaterial } from "../../media/reading-visual.js";
import { AdminResponseRepository } from "./response-repository.js";

type VisualRole = "choice" | "material";

export class AdminMediaRepository extends AdminResponseRepository {
  async requireCurrentQuestionVersion(itemId: string, itemVersion: number) {
    const current = await pool.query(
      `SELECT 1 FROM topik_bank.question_set_items
        WHERE item_id=$1 AND item_version=$2`,
      [itemId,itemVersion],
    );
    if (!current.rowCount) throw notFound("Current question version not found");
  }

  async visualGenerationTarget(client: PoolClient, input: {
    adminUserId: string; itemId: string; itemVersion: number; optionNumber: number;
    visualRole: VisualRole; forceRegenerate: boolean;
  }) {
    const current = await client.query(
      `SELECT 1 FROM topik_bank.question_set_items
        WHERE item_id=$1 AND item_version=$2`,
      [input.itemId,input.itemVersion],
    );
    if (!current.rowCount) throw notFound("Current question version not found");
    let promptSnapshot: Record<string, unknown> | null = null;
    if (input.visualRole === "choice") {
      const option = await client.query<{ prompt_snapshot: Record<string, unknown> }>(
        `SELECT jsonb_build_object(
                  'visualRole','choice',
                  'itemType',iv.item_type,
                  'description',COALESCE(iv.content_json->'visual_options'->($3::int-1)->>'description',''),
                  'imagePrompt',COALESCE(iv.content_json->'visual_options'->($3::int-1)->>'image_prompt',''),
                  'chartSpec',iv.content_json->'visual_options'->($3::int-1)->'chart_spec'
                ) AS prompt_snapshot
           FROM topik_bank.item_versions iv
          WHERE iv.item_id=$1 AND iv.item_version=$2 AND iv.section='listening'
            AND jsonb_typeof(iv.content_json->'visual_options')='array'
            AND jsonb_array_length(iv.content_json->'visual_options') >= $3`,
        [input.itemId,input.itemVersion,input.optionNumber],
      );
      const visual = option.rows[0];
      if (!visual) throw notFound("Listening visual option not found");
      promptSnapshot = visual.prompt_snapshot;

    } else {
      const item = await client.query<{
        item_type: string; stem: string; content_json: Record<string, unknown>;
      }>(
        `SELECT iv.item_type,iv.stem,iv.content_json
           FROM topik_bank.item_versions iv
          WHERE iv.item_id=$1 AND iv.item_version=$2 AND iv.section='reading'
            AND EXISTS (SELECT 1 FROM topik_bank.question_set_items qsi
              WHERE qsi.item_id=iv.item_id AND qsi.item_version=iv.item_version AND qsi.position=10)`,
        [input.itemId,input.itemVersion],
      );
      const row = item.rows[0];
      const material = row && normalizeReadingMaterial(10,row.content_json,row.stem);
      if (!row || !material) throw notFound("Reading graph material not found");
      promptSnapshot = materialPromptSnapshot(material,row.item_type);

    }
    const existing = await client.query<{ visualAssetId: string; url: string }>(
      `SELECT visual_asset_id AS "visualAssetId",storage_url AS url FROM topik_app.item_visual_assets
        WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND visual_role=$4 AND is_current LIMIT 1`,
      [input.itemId,input.itemVersion,input.optionNumber,input.visualRole],
    );
    return { promptSnapshot, asset: existing.rows[0] ?? null };
  }

  async deleteVisualAsset(
    itemId: string,itemVersion: number,optionNumber: number,visualAssetId: string,visualRole: VisualRole,
    removeObject: (bucket: string,path: string) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = await client.query<{ storage_bucket: string; storage_path: string }>(
        `SELECT storage_bucket,storage_path FROM topik_app.item_visual_assets
          WHERE visual_asset_id=$1 AND item_id=$2 AND item_version=$3 AND option_number=$4
            AND visual_role=$5 AND is_current
            AND EXISTS (SELECT 1 FROM topik_bank.question_set_items qsi
              WHERE qsi.item_id=$2 AND qsi.item_version=$3)
          FOR UPDATE`, [visualAssetId,itemId,itemVersion,optionNumber,visualRole],
      );
      const row = asset.rows[0];
      if (!row) throw notFound("Current visual asset not found");
      const shared = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM topik_app.item_visual_assets
          WHERE storage_bucket=$1 AND storage_path=$2 AND visual_asset_id<>$3`,
        [row.storage_bucket,row.storage_path,visualAssetId],
      );
      const storageDeleted = Number(shared.rows[0]?.count ?? 0) === 0;
      if (storageDeleted) await removeObject(row.storage_bucket,row.storage_path);
      await client.query("DELETE FROM topik_app.item_visual_assets WHERE visual_asset_id=$1", [visualAssetId]);
      await client.query("COMMIT");
      return storageDeleted
        ? { deleted:true,storageDeleted }
        : { deleted:true,storageDeleted,sharedAssetRetained:true };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async bindVisualAsset(input: {
    adminUserId: string; itemId: string; itemVersion: number; optionNumber: number;
    visualRole: VisualRole;
    bucket: string; path: string; url: string; mimeType: string; byteSize: number;
  }, signal?: AbortSignal, removeObject?: RemoveMediaObject) {
    const client = await pool.connect();
    let commitStarted = false;
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT 1 FROM topik_bank.question_set_items
          WHERE item_id=$1 AND item_version=$2 FOR UPDATE`,
        [input.itemId,input.itemVersion],
      );
      if (!current.rowCount) throw notFound("Current question version not found");
      if (input.visualRole === "material") {
        const allowed = await client.query(
          `SELECT 1 FROM topik_bank.item_versions iv
            WHERE iv.item_id=$1 AND iv.item_version=$2 AND iv.section='reading'
              AND EXISTS (SELECT 1 FROM topik_bank.question_set_items qsi
                WHERE qsi.item_id=iv.item_id AND qsi.item_version=iv.item_version AND qsi.position=10)`,
          [input.itemId,input.itemVersion],
        );
        if (!allowed.rowCount) throw notFound("Reading graph material not found");
      }
      const replaced = await client.query<{ visual_asset_id: string }>(
        `UPDATE topik_app.item_visual_assets SET is_current=FALSE
          WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND visual_role=$4 AND is_current
          RETURNING visual_asset_id`,
        [input.itemId,input.itemVersion,input.optionNumber,input.visualRole],
      );
      const assetId = randomUUID();
      await client.query(
        `INSERT INTO topik_app.item_visual_assets(
          visual_asset_id,item_id,item_version,option_number,visual_role,storage_bucket,storage_path,
          storage_url,mime_type,byte_size,created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [assetId,input.itemId,input.itemVersion,input.optionNumber,input.visualRole,input.bucket,input.path,
          input.url,input.mimeType,input.byteSize,input.adminUserId],
      );
      signal?.throwIfAborted();
      commitStarted = true;
      await client.query("COMMIT");
      await cleanupReplacedMedia(client, "visual", replaced.rows.map((asset) => asset.visual_asset_id), removeObject);
      return { visualAssetId: assetId, url: input.url };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (commitStarted) throw new MediaCommitUncertainError();
      throw error;
    } finally { client.release(); }
  }
}
