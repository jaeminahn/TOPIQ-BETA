import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { compressListeningImage } from "../src/media/listening-image.js";

export const optimizedPrefix = "optimized/listening-440-v1/";
export const assetSchema = z.object({
  id: z.string().uuid(), bucket: z.string().min(1), path: z.string().min(1),
  url: z.string().url(), mimeType: z.string().min(1), byteSize: z.number().int().positive(),
});
export type ImageAsset = z.infer<typeof assetSchema>;
export const preparedSchema = z.object({
  type: z.literal("prepared"), before: assetSchema, after: assetSchema,
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine((entry) => entry.before.id === entry.after.id && entry.before.bucket === entry.after.bucket
  && entry.after.path.startsWith(optimizedPrefix) && entry.before.path !== entry.after.path
  && entry.after.mimeType === "image/webp", "Invalid image replacement record");
export type PreparedImage = z.infer<typeof preparedSchema>;
export type Journal = (event: Record<string, unknown>) => Promise<void>;
export interface BackfillIO {
  download(bucket: string, path: string): Promise<Buffer>;
  upload(bucket: string, path: string, data: Buffer): Promise<void>;
  publicUrl(bucket: string, path: string): string;
  replace(expected: ImageAsset, replacement: ImageAsset): Promise<boolean>;
  current(id: string): Promise<ImageAsset | null>;
}
export const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export async function compressExistingImages(
  assets: ImageAsset[], apply: boolean, io: BackfillIO, journal: Journal,
) {
  const totals = { scanned: 0, changed: 0, skipped: 0, failed: 0, originalBytes: 0, compressedBytes: 0 };
  for (const before of assets) {
    totals.scanned++;
    let stage = "download";
    try {
      if (before.path.startsWith(optimizedPrefix)) {
        totals.skipped++;
        await journal({ type: "skipped", id: before.id, reason: "already-processed" });
        continue;
      }
      const source = await io.download(before.bucket, before.path);
      stage = "decode";
      const metadata = await sharp(source).metadata();
      // Protect newly uploaded WebP files from another lossy encoding pass.
      if (metadata.format === "webp" && metadata.width! <= 440 && metadata.height! <= 330
        && (!metadata.orientation || metadata.orientation === 1)) {
        totals.skipped++;
        await journal({ type: "skipped", id: before.id, reason: "already-small-webp" });
        continue;
      }
      if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported raster image");
      stage = "compress";
      const image = await compressListeningImage(source);
      if (image.data.length >= source.length) {
        totals.skipped++;
        await journal({ type: "skipped", id: before.id, reason: "no-size-reduction" });
        continue;
      }
      const path = `${optimizedPrefix}${before.id}/${randomUUID()}.webp`;
      const after: ImageAsset = {
        ...before, path, url: io.publicUrl(before.bucket, path), mimeType: image.mimeType, byteSize: image.data.length,
      };
      if (apply) {
        // Persist recovery data BEFORE either remote write. Even a lost DB acknowledgement is recoverable.
        stage = "journal";
        await journal({ type: "prepared", before, after, sourceSha256: digest(source) });
        stage = "upload";
        await io.upload(after.bucket, after.path, image.data);
        stage = "verify-upload";
        const stored = await io.download(after.bucket, after.path);
        if (digest(stored) !== digest(image.data)) throw new Error("Uploaded image verification failed");
        stage = "update-binding";
        if (!await io.replace(before, after)) throw new Error("Image binding changed concurrently; not replaced");
      }
      totals.changed++;
      totals.originalBytes += source.length;
      totals.compressedBytes += image.data.length;
      await journal({ type: apply ? "applied" : "preview", id: before.id,
        originalBytes: source.length, compressedBytes: image.data.length,
        savedPercent: Number((100 * (1 - image.data.length / source.length)).toFixed(1)) });
    } catch {
      totals.failed++;
      // Keep both objects on any failure, including uncertain DB commits. Never delete from a batch job.
      await journal({ type: "failed", id: before.id, stage,
        message: "Download, compression, upload verification, or conditional DB update failed. Originals retained; use this report for rollback." });
    }
  }
  return totals;
}

export async function rollbackImages(entries: PreparedImage[], io: BackfillIO, journal: Journal) {
  const totals = { restored: 0, skipped: 0, failed: 0 };
  for (const { before, after, sourceSha256 } of [...entries].reverse()) {
    try {
      const current = await io.current(before.id);
      if (!current || current.bucket !== after.bucket || current.path !== after.path) {
        totals.skipped++;
        await journal({ type: "skipped", id: before.id, reason: "not-pointing-to-this-replacement" });
        continue;
      }
      const original = await io.download(before.bucket, before.path);
      if (digest(original) !== sourceSha256) throw new Error("Original image is missing or changed");
      if (!await io.replace(after, before)) throw new Error("Image binding changed concurrently; not restored");
      totals.restored++;
      await journal({ type: "restored", id: before.id });
    } catch {
      totals.failed++;
      await journal({ type: "failed", id: before.id,
        message: "Original verification or conditional restore failed. Current binding retained unless DB acknowledgement was lost." });
    }
  }
  return totals;
}
