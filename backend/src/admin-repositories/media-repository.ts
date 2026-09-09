import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "../config.js";
import { pool } from "../db.js";
import { notFound } from "../errors.js";
import { materialPromptSnapshot, normalizeReadingMaterial } from "../reading-visual.js";
import { AdminResponseRepository } from "./response-repository.js";

type VisualRole = "choice" | "material";

export class AdminMediaRepository extends AdminResponseRepository {
  private async createVisualJob(client: PoolClient, input: {
    adminUserId: string; itemId: string; itemVersion: number; optionNumber: number;
    visualRole: VisualRole; forceRegenerate: boolean;
  }) {
    let promptSnapshot: Record<string, unknown> | null = null;
    let hasAsset = false;
    if (input.visualRole === "choice") {
      const option = await client.query<{ prompt_snapshot: Record<string, unknown>; has_asset: boolean }>(
        `SELECT jsonb_build_object(
                  'visualRole','choice',
                  'itemType',iv.item_type,
                  'description',COALESCE(iv.content_json->'visual_options'->($3::int-1)->>'description',''),
                  'imagePrompt',COALESCE(iv.content_json->'visual_options'->($3::int-1)->>'image_prompt',''),
                  'chartSpec',iv.content_json->'visual_options'->($3::int-1)->'chart_spec'
                ) AS prompt_snapshot,
                EXISTS (SELECT 1 FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
                    AND iva.visual_role='choice' AND iva.option_number=$3 AND iva.is_current) AS has_asset
           FROM topik_bank.item_versions iv
          WHERE iv.item_id=$1 AND iv.item_version=$2 AND iv.section='listening'
            AND jsonb_typeof(iv.content_json->'visual_options')='array'
            AND jsonb_array_length(iv.content_json->'visual_options') >= $3`,
        [input.itemId,input.itemVersion,input.optionNumber],
      );
      const visual = option.rows[0];
      if (!visual) throw notFound("Listening visual option not found");
      promptSnapshot = visual.prompt_snapshot;
      hasAsset = visual.has_asset;
    } else {
      const item = await client.query<{
        item_type: string; stem: string; content_json: Record<string, unknown>; has_asset: boolean;
      }>(
        `SELECT iv.item_type,iv.stem,iv.content_json,
                EXISTS (SELECT 1 FROM topik_app.item_visual_assets iva
                  WHERE iva.item_id=iv.item_id AND iva.item_version=iv.item_version
                    AND iva.visual_role='material' AND iva.option_number=1 AND iva.is_current) AS has_asset
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
      hasAsset = row.has_asset;
    }
    if (hasAsset && !input.forceRegenerate) return { queued: false, jobId: null, alreadyReady: true };
    const active = await client.query<{ job_id: string }>(
      `SELECT job_id FROM topik_app.visual_generation_jobs
        WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND visual_role=$4
          AND status IN ('queued','processing')
        ORDER BY created_at DESC LIMIT 1`, [input.itemId,input.itemVersion,input.optionNumber,input.visualRole],
    );
    if (active.rows[0]) return { queued: false, jobId: active.rows[0].job_id, alreadyReady: false };
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO topik_app.visual_generation_jobs(
         job_id,item_id,item_version,option_number,visual_role,requested_by,force_regenerate,model_name,prompt_snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [jobId,input.itemId,input.itemVersion,input.optionNumber,input.visualRole,input.adminUserId,input.forceRegenerate,
        config.googleImage.model,promptSnapshot],
    );
    return { queued: true, jobId, alreadyReady: false };
  }

  async enqueueVisualOption(adminUserId: string, itemId: string, itemVersion: number, optionNumber: number, forceRegenerate: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.createVisualJob(client, {
        adminUserId,itemId,itemVersion,optionNumber,visualRole:"choice",forceRegenerate,
      });
      await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async enqueueVisualSet(adminUserId: string, setId: string, setVersion: number, forceRegenerate: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const options = await client.query<{ item_id: string; item_version: number; option_number: number }>(
        `SELECT iv.item_id,iv.item_version,visual.ordinality::int option_number
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(iv.content_json->'visual_options','[]'::jsonb))
             WITH ORDINALITY AS visual(value,ordinality)
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND iv.section='listening'
          ORDER BY qsi.position,visual.ordinality`, [setId,setVersion],
      );
      if (!options.rowCount) throw notFound("Listening set visual options not found");
      const jobIds: string[] = [];
      for (const option of options.rows) {
        const result = await this.createVisualJob(client, {
          adminUserId,itemId:option.item_id,itemVersion:option.item_version,
          optionNumber:option.option_number,visualRole:"choice",forceRegenerate,
        });
        if (result.queued && result.jobId) jobIds.push(result.jobId);
      }
      await client.query("COMMIT");
      return { queued: jobIds.length,jobIds };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async enqueueReadingMaterial(adminUserId: string, itemId: string, itemVersion: number, forceRegenerate: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.createVisualJob(client, {
        adminUserId,itemId,itemVersion,optionNumber:1,visualRole:"material",forceRegenerate,
      });
      await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async enqueueReadingVisualSet(adminUserId: string, setId: string, setVersion: number, forceRegenerate: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const items = await client.query<{ item_id: string; item_version: number }>(
        `SELECT iv.item_id,iv.item_version
           FROM topik_bank.question_set_items qsi
           JOIN topik_bank.item_versions iv ON iv.item_id=qsi.item_id AND iv.item_version=qsi.item_version
          WHERE qsi.set_id=$1 AND qsi.set_version=$2 AND qsi.position=10 AND iv.section='reading'`,
        [setId,setVersion],
      );
      if (!items.rowCount) throw notFound("Reading set question 10 graph not found");
      const jobIds: string[] = [];
      for (const item of items.rows) {
        const result = await this.createVisualJob(client, {
          adminUserId,itemId:item.item_id,itemVersion:item.item_version,
          optionNumber:1,visualRole:"material",forceRegenerate,
        });
        if (result.queued && result.jobId) jobIds.push(result.jobId);
      }
      await client.query("COMMIT");
      return { queued:jobIds.length,jobIds };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
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
      await client.query("UPDATE topik_app.visual_generation_jobs SET visual_asset_id=NULL WHERE visual_asset_id=$1", [visualAssetId]);
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
  }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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
      const replaced = await client.query<{ visual_asset_id: string; storage_bucket: string; storage_path: string }>(
        `UPDATE topik_app.item_visual_assets SET is_current=FALSE
          WHERE item_id=$1 AND item_version=$2 AND option_number=$3 AND visual_role=$4 AND is_current
          RETURNING visual_asset_id,storage_bucket,storage_path`,
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
      await client.query("COMMIT");
      return { visualAssetId: assetId, url: input.url, replacedAssets: replaced.rows };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async removeSupersededVisualAsset(
    visualAssetId: string,
    removeObject: (bucket: string, path: string) => Promise<void>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = await client.query<{ storage_bucket: string; storage_path: string }>(
        `SELECT storage_bucket,storage_path FROM topik_app.item_visual_assets
          WHERE visual_asset_id=$1 AND NOT is_current FOR UPDATE`,
        [visualAssetId],
      );
      const row = asset.rows[0];
      if (!row) { await client.query("COMMIT"); return { deleted: false, storageDeleted: false }; }
      const shared = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM topik_app.item_visual_assets
          WHERE storage_bucket=$1 AND storage_path=$2 AND visual_asset_id<>$3`,
        [row.storage_bucket,row.storage_path,visualAssetId],
      );
      const storageDeleted = Number(shared.rows[0]?.count ?? 0) === 0;
      if (storageDeleted) await removeObject(row.storage_bucket,row.storage_path);
      await client.query("DELETE FROM topik_app.item_visual_assets WHERE visual_asset_id=$1", [visualAssetId]);
      await client.query("COMMIT");
      return { deleted: true, storageDeleted };
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }
}
