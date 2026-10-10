import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "../../admin/auth.js";
import type { AdminRepository } from "../../admin/repository.js";
import { visualService } from "../../media/visual-service.js";
import { AppError, MediaCommitUncertainError } from "../../core/errors.js";
import { ttsService } from "../../listening/tts-service.js";
import { mediaCleanupWorker } from "../../media/cleanup-worker.js";
import { SupabaseStorage } from "../../media/storage.js";
import { requireSessionToken } from "../route-auth.js";

const listeningItemParams = z.object({ itemId: z.string().uuid(), itemVersion: z.coerce.number().int().positive() });
const readingItemParams = z.object({ itemId: z.string().uuid(), itemVersion: z.coerce.number().int().positive() });
const setParams = z.object({ setId: z.string().uuid() });
const listeningGroupParams = setParams.extend({ leaderItemId: z.string().uuid() });
const visualParams = listeningItemParams.extend({ optionNumber: z.coerce.number().int().min(1).max(4) });
const visualAssetParams = visualParams.extend({ visualAssetId: z.string().uuid() });
const readingVisualAssetParams = readingItemParams.extend({ visualAssetId: z.string().uuid() });
const adminAudioParams = z.object({ audioAssetId: z.string().uuid() });
export const ttsStyleSchema = z.object({
  speakingRate: z.number().finite().min(0.8).max(1.2).default(1),
  stylePrompt: z.string().trim().max(300).default(""),
});
const generationBody = z.object({ forceRegenerate: z.boolean().default(false) });
const ttsGenerationBody = generationBody.extend({
  ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }),
});
const imageMimeTypes = ["image/png", "image/jpeg", "image/webp"];

function imageExtension(mimeType: string) {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

export function registerAdminMediaRoutes(app: FastifyInstance, repository: AdminRepository) {
  app.get("/v1/admin/listening/audio/:audioAssetId/url", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const path = await repository.audioPath(audioAssetId);
    return { audioUrl: await new SupabaseStorage().signedAudioUrl(path, 600) };
  });

  app.post("/v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/tts", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId, leaderItemId } = listeningGroupParams.parse(request.params);
    const body = ttsGenerationBody.parse(request.body ?? {});
    return ttsService.generateGroup(admin.adminUserId,setId,leaderItemId,body.forceRegenerate,body.ttsStyle);
  });

  for (const path of [
    "/v1/admin/listening/sets/:setId/audio-groups/:leaderItemId/audio/:audioAssetId",
    "/v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/audio/:audioAssetId",
  ]) {
    app.delete(path, async (request) => {
      await requireAdmin(requireSessionToken(request.headers.authorization));
      const { setId, leaderItemId } = listeningGroupParams.parse(request.params);
      const { audioAssetId } = adminAudioParams.parse(request.params);
      const storage = new SupabaseStorage();
      return repository.deleteAudioGroup(
        setId,
        leaderItemId,
        audioAssetId,
        (bucket, path) => storage.removeObject(bucket, path),
      );
    });
  }

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber", async (request, reply) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion, optionNumber } = visualParams.parse(request.params);
    await repository.requireCurrentQuestionVersion(itemId,itemVersion);
    const file = await request.file();
    if (!file || !imageMimeTypes.includes(file.mimetype)) {
      throw new AppError(400, "IMAGE_REQUIRED", "A PNG, JPEG or WebP image is required");
    }
    const data = await file.toBuffer();
    const path = `listening/${itemId}/v${itemVersion}/option-${optionNumber}-${randomUUID()}.${imageExtension(file.mimetype)}`;
    const storage = new SupabaseStorage();
    const uploaded = await storage.uploadMedia(path, data, file.mimetype);
    let result: Awaited<ReturnType<typeof repository.bindVisualAsset>>;
    try {
      result = await repository.bindVisualAsset({
        adminUserId: admin.adminUserId,
        itemId,
        itemVersion,
        optionNumber,
        visualRole: "choice",
        bucket: uploaded.bucket,
        path: uploaded.path,
        url: uploaded.url,
        mimeType: file.mimetype,
        byteSize: data.length,
      });
    } catch (error) {
      if (!(error instanceof MediaCommitUncertainError)) await storage.removeObject(uploaded.bucket,uploaded.path).catch(() => undefined);
      throw error;
    }
    mediaCleanupWorker.kick();
    return reply.code(201).send(result);
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/generate", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion, optionNumber } = visualParams.parse(request.params);
    const body = generationBody.parse(request.body ?? {});
    return visualService.generate({adminUserId:admin.adminUserId,itemId,itemVersion,optionNumber,visualRole:"choice",forceRegenerate:body.forceRegenerate});
  });


  app.delete("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/assets/:visualAssetId", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion, optionNumber, visualAssetId } = visualAssetParams.parse(request.params);
    const storage = new SupabaseStorage();
    return repository.deleteVisualAsset(
      itemId,
      itemVersion,
      optionNumber,
      visualAssetId,
      "choice",
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });

  app.post("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material", async (request, reply) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion } = readingItemParams.parse(request.params);
    await repository.requireCurrentQuestionVersion(itemId,itemVersion);
    const file = await request.file();
    if (!file || !imageMimeTypes.includes(file.mimetype)) {
      throw new AppError(400, "IMAGE_REQUIRED", "A PNG, JPEG or WebP image is required");
    }
    const data = await file.toBuffer();
    const path = `reading/${itemId}/v${itemVersion}/material-${randomUUID()}.${imageExtension(file.mimetype)}`;
    const storage = new SupabaseStorage();
    const uploaded = await storage.uploadMedia(path, data, file.mimetype);
    let result: Awaited<ReturnType<typeof repository.bindVisualAsset>>;
    try {
      result = await repository.bindVisualAsset({
        adminUserId: admin.adminUserId,
        itemId,
        itemVersion,
        optionNumber: 1,
        visualRole: "material",
        bucket: uploaded.bucket,
        path: uploaded.path,
        url: uploaded.url,
        mimeType: file.mimetype,
        byteSize: data.length,
      });
    } catch (error) {
      if (!(error instanceof MediaCommitUncertainError)) await storage.removeObject(uploaded.bucket,uploaded.path).catch(() => undefined);
      throw error;
    }
    mediaCleanupWorker.kick();
    return reply.code(201).send(result);
  });

  app.post("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/generate", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion } = readingItemParams.parse(request.params);
    const body = generationBody.parse(request.body ?? {});
    return visualService.generate({adminUserId:admin.adminUserId,itemId,itemVersion,optionNumber:1,visualRole:"material",forceRegenerate:body.forceRegenerate});
  });


  app.delete("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/assets/:visualAssetId", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { itemId, itemVersion, visualAssetId } = readingVisualAssetParams.parse(request.params);
    const storage = new SupabaseStorage();
    return repository.deleteVisualAsset(
      itemId,
      itemVersion,
      1,
      visualAssetId,
      "material",
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });
}
