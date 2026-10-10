import { randomUUID } from "node:crypto";
import { AdminRepository } from "../admin/repository.js";
import { config } from "../core/config.js";
import { AppError, MediaCommitUncertainError } from "../core/errors.js";
import { GoogleImageClient, renderChartSvg, type ChartSpec } from "./google-image.js";
import { withGeneration } from "./generation.js";
import { SupabaseStorage } from "./storage.js";
import { mediaCleanupWorker } from "./cleanup-worker.js";

export class VisualService {
  constructor(
    private readonly image = new GoogleImageClient(),
    private readonly storageFactory = (signal?: AbortSignal) => new SupabaseStorage(signal),
    private readonly repository = new AdminRepository(),
  ) {}

  async generate(input: {
    adminUserId: string; itemId: string; itemVersion: number; optionNumber: number;
    visualRole: "choice" | "material"; forceRegenerate: boolean;
  }) {
    return withGeneration("visual", async (signal, client) => {
      const { promptSnapshot: snapshot, asset } = await this.repository.visualGenerationTarget(client,input);
      if (asset && !input.forceRegenerate) return { ...asset, reused: true };
      let generated: { data: Buffer; mimeType: string; extension: string };
      try {
        if (input.visualRole === "choice" && snapshot?.itemType === "visual_chart") {
          generated = {data: renderChartSvg((snapshot.chartSpec ?? {}) as ChartSpec),mimeType:"image/svg+xml",extension:"svg"};
        } else {
          const prompt = String(snapshot?.imagePrompt || snapshot?.description || "").trim();
          if (!prompt) throw new AppError(400,"IMAGE_PROMPT_REQUIRED","Image prompt is missing");
          generated = await this.image.generate(prompt,input.visualRole === "material" ? "reading_material" : "listening_choice",signal);
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (error instanceof AppError) throw error;
        throw new AppError(502,"IMAGE_PROVIDER_FAILED",error instanceof Error ? error.message : "Image generation failed");
      }
      signal.throwIfAborted();
      const path = input.visualRole === "material"
        ? `reading/${input.itemId}/v${input.itemVersion}/material-${randomUUID()}.${generated.extension}`
        : `listening/${input.itemId}/v${input.itemVersion}/option-${input.optionNumber}-${randomUUID()}.${generated.extension}`;
      let committed = false;
      try {
        const uploaded = await this.storageFactory(signal).uploadMedia(path,generated.data,generated.mimeType);
        signal.throwIfAborted();
        const result = await this.repository.bindVisualAsset({
          ...input,bucket:uploaded.bucket,path:uploaded.path,url:uploaded.url,
          mimeType:generated.mimeType,byteSize:generated.data.length,
        }, signal);
        committed = true;
        mediaCleanupWorker.kick();
        return { ...result, reused: false };
      } catch (error) {
        if (error instanceof MediaCommitUncertainError) committed = true;
        throw error;
      } finally {
        if (!committed) await this.storageFactory(AbortSignal.timeout(10_000)).removeObject(config.supabase.mediaBucket,path)
          .catch((error) => console.error("Unbound image cleanup failed",error));
      }
    });
  }
}
export const visualService = new VisualService();
