import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { SupabaseStorage } from "./storage.js";

type CleanupJob = {
  cleanup_job_id: string;
  asset_type: "visual" | "audio";
  asset_id: string;
  storage_bucket: string;
  storage_path: string;
  attempts: number;
};

export class MediaCleanupWorker {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(private readonly storageFactory = () => new SupabaseStorage()) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), 15_000);
    this.timer.unref();
    void this.runOnce();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  kick() { void this.runOnce(); }

  private async claim(): Promise<CleanupJob | null> {
    const result = await pool.query<CleanupJob>(
      `WITH candidate AS (
         SELECT cleanup_job_id FROM topik_app.media_cleanup_jobs
          WHERE ((status IN ('queued','waiting') AND next_attempt_at<=CURRENT_TIMESTAMP)
              OR (status='processing' AND lease_expires_at<CURRENT_TIMESTAMP))
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE topik_app.media_cleanup_jobs job
          SET status='processing',attempts=attempts+1,error_message=NULL,
              lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '2 minutes'
         FROM candidate WHERE job.cleanup_job_id=candidate.cleanup_job_id
       RETURNING job.*`,
    );
    return result.rows[0] ?? null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      let job: CleanupJob | null;
      while ((job = await this.claim())) await this.process(job);
    } catch (error) {
      console.error("Media cleanup worker polling failed", error);
    } finally {
      this.running = false;
    }
  }

  private async process(job: CleanupJob) {
    try {
      if (job.asset_type === "visual") await this.cleanupVisual(job);
      else await this.cleanupAudio(job);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      const retryMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      await pool.query(
        `UPDATE topik_app.media_cleanup_jobs
            SET status='queued',error_message=$2,
                next_attempt_at=CURRENT_TIMESTAMP+$3::int*INTERVAL '1 minute',lease_expires_at=NULL
          WHERE cleanup_job_id=$1`,
        [job.cleanup_job_id, message, retryMinutes],
      );
    }
  }

  private async cleanupVisual(job: CleanupJob) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = await client.query<{ is_current: boolean }>(
        "SELECT is_current FROM topik_app.item_visual_assets WHERE visual_asset_id=$1 FOR UPDATE",
        [job.asset_id],
      );
      if (!asset.rows[0]) {
        await client.query("DELETE FROM topik_app.media_cleanup_jobs WHERE cleanup_job_id=$1", [job.cleanup_job_id]);
        await client.query("COMMIT");
        return;
      }
      if (asset.rows[0].is_current) {
        await this.waitForLastReference(client, job.cleanup_job_id);
        await client.query("COMMIT");
        return;
      }
      const sharedPath = await client.query(
        `SELECT 1 FROM topik_app.item_visual_assets
          WHERE storage_bucket=$1 AND storage_path=$2 AND visual_asset_id<>$3 AND is_current LIMIT 1`,
        [job.storage_bucket, job.storage_path, job.asset_id],
      );
      if (!sharedPath.rowCount) {
        await this.storageFactory().removeObject(job.storage_bucket, job.storage_path);
      }
      await client.query("DELETE FROM topik_app.item_visual_assets WHERE visual_asset_id=$1", [job.asset_id]);
      await client.query("DELETE FROM topik_app.media_cleanup_jobs WHERE cleanup_job_id=$1", [job.cleanup_job_id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async cleanupAudio(job: CleanupJob) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = await client.query(
        "SELECT 1 FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1 FOR UPDATE",
        [job.asset_id],
      );
      if (!asset.rowCount) {
        await client.query("DELETE FROM topik_app.media_cleanup_jobs WHERE cleanup_job_id=$1", [job.cleanup_job_id]);
        await client.query("COMMIT");
        return;
      }
      const currentBinding = await client.query(
        `SELECT 1 FROM topik_app.item_audio_bindings
          WHERE audio_asset_id=$1 AND is_current
         UNION ALL
         SELECT 1 FROM topik_app.question_set_item_audio_bindings
          WHERE audio_asset_id=$1 AND is_current LIMIT 1`,
        [job.asset_id],
      );
      if (currentBinding.rowCount) {
        await this.waitForLastReference(client, job.cleanup_job_id);
        await client.query("COMMIT");
        return;
      }
      const sharedPath = await client.query(
        `SELECT 1 FROM topik_app.tts_audio_assets shared
          WHERE shared.storage_bucket=$1 AND shared.storage_path=$2 AND shared.audio_asset_id<>$3
            AND shared.deleted_at IS NULL
            AND (
              EXISTS (SELECT 1 FROM topik_app.item_audio_bindings binding
                WHERE binding.audio_asset_id=shared.audio_asset_id AND binding.is_current)
              OR EXISTS (SELECT 1 FROM topik_app.question_set_item_audio_bindings binding
                WHERE binding.audio_asset_id=shared.audio_asset_id AND binding.is_current)
            )
          LIMIT 1`,
        [job.storage_bucket, job.storage_path, job.asset_id],
      );
      if (!sharedPath.rowCount) {
        await this.storageFactory().removeObject(job.storage_bucket, job.storage_path);
      }
      await client.query("UPDATE topik_app.tts_generation_jobs SET audio_asset_id=NULL WHERE audio_asset_id=$1", [job.asset_id]);
      await client.query("DELETE FROM topik_app.item_audio_bindings WHERE audio_asset_id=$1", [job.asset_id]);
      await client.query("DELETE FROM topik_app.question_set_item_audio_bindings WHERE audio_asset_id=$1", [job.asset_id]);
      const playback = await client.query(
        "SELECT 1 FROM topik_app.audio_playback_events WHERE audio_asset_id=$1 LIMIT 1",
        [job.asset_id],
      );
      if (playback.rowCount) {
        await client.query(
          "UPDATE topik_app.tts_audio_assets SET deleted_at=CURRENT_TIMESTAMP,storage_url='' WHERE audio_asset_id=$1",
          [job.asset_id],
        );
      } else {
        await client.query("DELETE FROM topik_app.tts_audio_assets WHERE audio_asset_id=$1", [job.asset_id]);
      }
      await client.query("DELETE FROM topik_app.media_cleanup_jobs WHERE cleanup_job_id=$1", [job.cleanup_job_id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async waitForLastReference(client: Pick<PoolClient, "query">, cleanupJobId: string) {
    await client.query(
      `UPDATE topik_app.media_cleanup_jobs
          SET status='waiting',next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes',lease_expires_at=NULL
        WHERE cleanup_job_id=$1`,
      [cleanupJobId],
    );
  }
}

export const mediaCleanupWorker = new MediaCleanupWorker();
