import { randomUUID } from "node:crypto";
import { AdminRepository } from "./admin-repository.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { GoogleImageClient, renderChartSvg, type ChartSpec } from "./google-image.js";
import { SupabaseStorage } from "./storage.js";

type VisualJob = {
  job_id: string; item_id: string; item_version: number; option_number: number;
  visual_role: "choice" | "material";
  requested_by: string; attempts: number; prompt_snapshot: {
    itemType?: string; description?: string; imagePrompt?: string; chartSpec?: ChartSpec | null;
  };
};

export class VisualWorker {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly imageClient = new GoogleImageClient(),
    private readonly storageFactory = () => new SupabaseStorage(),
    private readonly repository = new AdminRepository(),
  ) {}

  start() {
    if (!config.googleImage.workerEnabled || this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), 3_000);
    this.timer.unref(); void this.runOnce();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  kick() { void this.runOnce(); }

  private async claim() {
    const result = await pool.query<VisualJob>(
      `WITH candidate AS (
         SELECT job_id FROM topik_app.visual_generation_jobs
          WHERE (status='queued' OR (status='processing' AND lease_expires_at<CURRENT_TIMESTAMP))
            AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE topik_app.visual_generation_jobs job
          SET status='processing',attempts=attempts+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
              lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes',error_message=NULL
         FROM candidate WHERE job.job_id=candidate.job_id RETURNING job.*`,
    );
    return result.rows[0] ?? null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      let job: VisualJob | null;
      while ((job = await this.claim())) await this.process(job);
    } catch (error) {
      console.error("Visual worker polling failed", error);
    } finally { this.running = false; }
  }

  private async process(job: VisualJob) {
    try {
      const snapshot = job.prompt_snapshot ?? {};
      const visualRole = job.visual_role ?? "choice";
      let generated: { data: Buffer; mimeType: string; extension: string };
      if (visualRole === "choice" && snapshot.itemType === "visual_chart") {
        generated = { data: renderChartSvg(snapshot.chartSpec ?? {}),mimeType:"image/svg+xml",extension:"svg" };
      } else {
        const prompt = snapshot.imagePrompt?.trim() || snapshot.description?.trim();
        if (!prompt) throw new Error("Visual image_prompt and description are missing");
        generated = await this.imageClient.generate(
          prompt,
          visualRole === "material" ? "reading_material" : "listening_choice",
        );
      }
      const path = visualRole === "material"
        ? `reading/${job.item_id}/v${job.item_version}/material-${randomUUID()}.${generated.extension}`
        : `listening/${job.item_id}/v${job.item_version}/option-${job.option_number}-${randomUUID()}.${generated.extension}`;
      const storage = this.storageFactory();
      const uploaded = await storage.uploadMedia(path,generated.data,generated.mimeType);
      const bound = await this.repository.bindVisualAsset({
        adminUserId:job.requested_by,itemId:job.item_id,itemVersion:job.item_version,
        optionNumber:job.option_number,visualRole,bucket:uploaded.bucket,path:uploaded.path,url:uploaded.url,
        mimeType:generated.mimeType,byteSize:generated.data.length,
      });
      for (const replaced of bound.replacedAssets) {
        await this.repository.removeSupersededVisualAsset(
          replaced.visual_asset_id,
          (bucket, path) => storage.removeObject(bucket, path),
        );
      }
      await pool.query(
        `UPDATE topik_app.visual_generation_jobs SET status='succeeded',visual_asset_id=$2,
          completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL WHERE job_id=$1`,
        [job.job_id,bound.visualAssetId],
      );
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0,1000);
      await pool.query(
        `UPDATE topik_app.visual_generation_jobs
            SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_message=$2,
                completed_at=CASE WHEN attempts>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,lease_expires_at=NULL
          WHERE job_id=$1`, [job.job_id,message],
      );
    }
  }
}

export const visualWorker = new VisualWorker();
