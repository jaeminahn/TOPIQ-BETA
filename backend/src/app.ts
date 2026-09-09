import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { bearerToken } from "./domain.js";
import { AppError } from "./errors.js";
import { TopikRepository } from "./repository.js";
import { AdminRepository } from "./admin-repository.js";
import { adminLogin, requireAdmin } from "./admin-auth.js";
import { SupabaseStorage } from "./storage.js";
import { ttsWorker } from "./tts-worker.js";
import { visualWorker } from "./visual-worker.js";
import { BrevoResultEmailSender, type ResultEmailSender } from "./brevo-result-email.js";
import {
  AdminExportRepository,
  adminExportDatasets,
  exportFilename,
  parseAdminExportFilters,
  type AdminExportSource,
} from "./admin-export.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });
const itemParams = sessionParams.extend({ itemOrder: z.coerce.number().int().min(1).max(100) });
const audioParams = sessionParams.extend({ audioAssetId: z.string().uuid() });
const listeningItemParams = z.object({ itemId: z.string().uuid(), itemVersion: z.coerce.number().int().positive() });
const readingItemParams = z.object({ itemId: z.string().uuid(), itemVersion: z.coerce.number().int().positive() });
const listeningSetParams = z.object({ setId: z.string().uuid(), setVersion: z.coerce.number().int().positive() });
const readingSetParams = z.object({ setId: z.string().uuid(), setVersion: z.coerce.number().int().positive() });
const listeningGroupParams = listeningSetParams.extend({ leaderItemId: z.string().uuid() });
const visualParams = listeningItemParams.extend({ optionNumber: z.coerce.number().int().min(1).max(4) });
const visualAssetParams = visualParams.extend({ visualAssetId: z.string().uuid() });
const readingVisualAssetParams = readingItemParams.extend({ visualAssetId: z.string().uuid() });
const mockTestParams = z.object({ mockTestId: z.string().uuid() });
const questionSetRevisionParams = z.object({ setId: z.string().uuid(), setVersion: z.coerce.number().int().positive() });
const adminAudioParams = z.object({ audioAssetId: z.string().uuid() });
const adminExportParams = z.object({ dataset: z.enum(adminExportDatasets) });
export const ttsStyleSchema = z.object({
  speakingRate: z.number().finite().min(0.8).max(1.2).default(1),
  stylePrompt: z.string().trim().max(300).default(""),
});

function requireToken(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError(401, "SESSION_TOKEN_REQUIRED", "Session token required");
  return token;
}

function requireResultToken(authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (!token) throw new AppError(401, "RESULT_TOKEN_REQUIRED", "Result token required");
  return token;
}

function isClientHttpError(
  error: unknown,
): error is Error & { statusCode: number; code?: string } {
  if (!(error instanceof Error) || !("statusCode" in error)) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

export async function buildApp(
  repository = new TopikRepository(),
  adminRepository = new AdminRepository(),
  resultEmailSender: ResultEmailSender = new BrevoResultEmailSender(),
  adminExportRepository: AdminExportSource = new AdminExportRepository(),
) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: config.trustProxy,
    bodyLimit: 6 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.appOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Disposition", "X-Export-Row-Count"],
  });
  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024 } });

  app.get("/health", async () => ({ ok: true, service: "unigate-topik-api" }));

  app.get("/v1/exams", async () => ({ exams: await repository.listExams() }));

  app.post("/v1/sessions", async (request, reply) => {
    const body = z
      .object({ mockTestId: z.string().uuid(), mode: z.enum(["timed", "practice"]) })
      .parse(request.body);
    const created = await repository.createSession(body.mockTestId, body.mode);
    return reply.code(201).send(created);
  });

  app.get("/v1/sessions/:sessionId", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.getSession(sessionId, requireToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/items/:itemOrder/events", async (request) => {
    const { sessionId, itemOrder } = itemParams.parse(request.params);
    const body = z
      .object({
        clientEventId: z.string().uuid(),
        eventType: z.enum(["presented", "hidden", "heartbeat"]),
        durationMs: z.number().finite().min(0),
      })
      .parse(request.body);
    return repository.recordEvent({
      sessionId,
      itemOrder,
      token: requireToken(request.headers.authorization),
      ...body,
    });
  });

  app.put("/v1/sessions/:sessionId/items/:itemOrder/answer", async (request) => {
    const { sessionId, itemOrder } = itemParams.parse(request.params);
    const body = z
      .object({
        clientEventId: z.string().uuid(),
        selectedOption: z.number().int().min(1).max(4),
        durationMs: z.number().finite().min(0),
      })
      .parse(request.body);
    return repository.saveAnswer({
      sessionId,
      itemOrder,
      token: requireToken(request.headers.authorization),
      ...body,
    });
  });

  app.post("/v1/sessions/:sessionId/audio/:audioAssetId/playback", async (request) => {
    const { sessionId, audioAssetId } = audioParams.parse(request.params);
    const body = z.object({
      clientPlayId: z.string().uuid(),
      eventType: z.enum(["prepared", "started", "completed", "interrupted"]),
    }).parse(request.body);
    return repository.recordAudioPlayback({
      sessionId, audioAssetId, token: requireToken(request.headers.authorization), ...body,
    });
  });

  app.post("/v1/sessions/:sessionId/submit", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.submitSession(sessionId, requireToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/abandon", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.abandonSession(sessionId, requireToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/result-email", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const { sessionId } = sessionParams.parse(request.params);
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        locale: z.enum(["ko", "en"]),
        email: z.string().trim().email().max(320),
      })
      .parse(request.body);
    const prepared = await repository.prepareResultEmail({
      sessionId,
      token: requireToken(request.headers.authorization),
      ...body,
    });
    let messageId: string;
    try {
      ({ messageId } = await resultEmailSender.send({
        recipient: prepared.recipient,
        locale: prepared.locale,
        titleKo: prepared.titleKo,
        titleEn: prepared.titleEn,
        resultToken: prepared.resultToken,
        expiresAt: prepared.expiresAt,
      }));
    } catch (error) {
      try {
        await repository.markResultEmailFailed(prepared.deliveryId, "BREVO_SEND_FAILED");
      } catch (markError) {
        app.log.error(markError, "Unable to mark result email as failed");
      }
      app.log.error(error, "Brevo result email request failed");
      throw new AppError(502, "RESULT_EMAIL_SEND_FAILED", "Unable to send the result email");
    }
    try {
      await repository.markResultEmailAccepted(prepared.deliveryId, messageId);
    } catch (error) {
      app.log.error(error, "Brevo accepted the result email but its status could not be persisted");
    }
    return reply.code(202).send({
      emailAccepted: true,
      maskedEmail: prepared.maskedEmail,
      expiresAt: prepared.expiresAt.toISOString(),
    });
  });

  app.get("/v1/results", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return repository.getResultsByToken(requireResultToken(request.headers.authorization));
  });

  app.get("/v1/admin/me", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    return { admin: { id: admin.adminUserId, email: admin.email } };
  });

  app.post("/v1/admin/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (request) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(12).max(200) }).parse(request.body);
    return adminLogin(body.email, body.password);
  });

  app.get("/v1/admin/dashboard", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { summary: await adminRepository.dashboard() };
  });

  app.get("/v1/admin/exports/options", async (request, reply) => {
    await requireAdmin(requireToken(request.headers.authorization));
    reply.header("Cache-Control", "no-store");
    return adminExportRepository.options();
  });

  app.get("/v1/admin/exports/:dataset/preview", async (request, reply) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { dataset } = adminExportParams.parse(request.params);
    const filters = parseAdminExportFilters(request.query, dataset);
    const preview = await adminExportRepository.preview(dataset, filters);
    reply.header("Cache-Control", "no-store");
    return { ...preview, filters, generatedAt: new Date().toISOString() };
  });

  app.get("/v1/admin/exports/:dataset.csv", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { dataset } = adminExportParams.parse(request.params);
    const filters = parseAdminExportFilters(request.query, dataset);
    const preview = await adminExportRepository.preview(dataset, filters);
    request.log.info({
      adminUserId: admin.adminUserId,
      dataset,
      filters,
      rowCount: preview.rowCount,
      sessionCount: preview.sessionCount,
    }, "Admin CSV export started");
    reply
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="${exportFilename(dataset)}"`)
      .header("X-Export-Row-Count", String(preview.rowCount))
      .type("text/csv; charset=utf-8");
    const stream = adminExportRepository.csvStream(dataset, filters);
    const startedAt = Date.now();
    stream.once("end", () => request.log.info({
      adminUserId: admin.adminUserId,
      dataset,
      rowCount: preview.rowCount,
      durationMs: Date.now() - startedAt,
    }, "Admin CSV export completed"));
    stream.once("error", (error) => request.log.error({
      error,
      adminUserId: admin.adminUserId,
      dataset,
      rowCount: preview.rowCount,
      durationMs: Date.now() - startedAt,
    }, "Admin CSV export failed"));
    return reply.send(stream);
  });

  app.get("/v1/admin/listening/items", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      status: z.enum(["ready", "missing", "failed"]).optional(),
    }).parse(request.query);
    return { items: await adminRepository.listListeningItems(query.setId, query.status) };
  });

  app.get("/v1/admin/listening/sets", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { sets: await adminRepository.listListeningSets() };
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/register", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { setId,setVersion } = listeningSetParams.parse(request.params);
    return adminRepository.registerListeningSet(setId,setVersion);
  });

  app.get("/v1/admin/reading/items", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      search: z.string().trim().max(100).optional(),
    }).parse(request.query);
    return { items: await adminRepository.listReadingItems(query.setId, query.search) };
  });

  app.get("/v1/admin/reading/sets", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { sets: await adminRepository.listReadingSets() };
  });

  app.post("/v1/admin/reading/sets/:setId/versions/:setVersion/publish", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion } = readingSetParams.parse(request.params);
    return adminRepository.publishReadingSet(setId, setVersion);
  });

  app.get("/v1/admin/responses/sessions", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({
      section: z.enum(["reading", "listening"]).optional(),
      correctness: z.enum(["correct", "incorrect", "unanswered"]).optional(),
      status: z.enum(["submitted", "abandoned"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(50),
    }).parse(request.query);
    return adminRepository.listResponseSessions(query);
  });

  app.get("/v1/admin/responses/sessions/:sessionId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { sessionId } = sessionParams.parse(request.params);
    return adminRepository.getResponseSession(sessionId);
  });

  app.delete("/v1/admin/responses/sessions", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const body = z.object({ sessionIds: z.array(z.string().uuid()).min(1).max(100) }).parse(request.body);
    return adminRepository.deleteResponseSessions(admin.adminUserId, [...new Set(body.sessionIds)]);
  });

  app.delete("/v1/admin/responses/sessions/all", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const body = z.object({ confirmation: z.literal("전체 응답 삭제") }).parse(request.body);
    return adminRepository.deleteResponseSessions(admin.adminUserId, "all");
  });

  app.delete("/v1/admin/responses/sessions/abandoned/all", async (request) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const body = z.object({ confirmation: z.literal("폐기 세션 전체 삭제") }).parse(request.body);
    return adminRepository.deleteResponseSessions(admin.adminUserId, "abandoned");
  });

  app.get("/v1/admin/tts/jobs", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    return { jobs: await adminRepository.listJobs(query.limit) };
  });

  app.get("/v1/admin/listening/mock-tests", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    return { mockTests: await adminRepository.listListeningMockTests() };
  });

  app.get("/v1/admin/listening/audio/:audioAssetId/url", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const path = await adminRepository.audioPath(audioAssetId);
    return { audioUrl: await new SupabaseStorage().signedAudioUrl(path, 600) };
  });

  app.delete("/v1/admin/listening/items/:itemId/versions/:itemVersion/audio/:audioAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion } = listeningItemParams.parse(request.params);
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteAudioAsset(
      itemId,
      itemVersion,
      audioAssetId,
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion } = listeningItemParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueItem(admin.adminUserId, itemId, itemVersion, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion } = listeningSetParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueSet(admin.adminUserId, setId, setVersion, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/tts", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion, leaderItemId } = listeningGroupParams.parse(request.params);
    const body = z.object({ forceRegenerate: z.boolean().default(false), ttsStyle: ttsStyleSchema.default({ speakingRate: 1, stylePrompt: "" }) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueGroup(admin.adminUserId, setId, setVersion, leaderItemId, body.forceRegenerate, body.ttsStyle);
    ttsWorker.kick();
    return reply.code(202).send(result);
  });

  app.delete("/v1/admin/listening/sets/:setId/versions/:setVersion/audio-groups/:leaderItemId/audio/:audioAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion, leaderItemId } = listeningGroupParams.parse(request.params);
    const { audioAssetId } = adminAudioParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteAudioGroup(
      setId, setVersion, leaderItemId, audioAssetId,
      (bucket, path) => storage.removeObject(bucket, path),
    );
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId, itemVersion, optionNumber } = visualParams.parse(request.params);
    const file = await request.file();
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new AppError(400, "IMAGE_REQUIRED", "A PNG, JPEG or WebP image is required");
    }
    const data = await file.toBuffer();
    const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const path = `listening/${itemId}/v${itemVersion}/option-${optionNumber}-${randomUUID()}.${extension}`;
    const uploaded = await new SupabaseStorage().uploadMedia(path, data, file.mimetype);
    const result = await adminRepository.bindVisualAsset({
      adminUserId: admin.adminUserId, itemId, itemVersion, optionNumber, visualRole:"choice",
      bucket: uploaded.bucket, path: uploaded.path, url: uploaded.url,
      mimeType: file.mimetype, byteSize: data.length,
    });
    for (const replaced of result.replacedAssets) {
      await adminRepository.removeSupersededVisualAsset(
        replaced.visual_asset_id,
        (bucket, path) => new SupabaseStorage().removeObject(bucket, path),
      );
    }
    return reply.code(201).send(result);
  });

  app.post("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/generate", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId,itemVersion,optionNumber } = visualParams.parse(request.params);
    const body = z.object({ forceRegenerate:z.boolean().default(false) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueVisualOption(admin.adminUserId,itemId,itemVersion,optionNumber,body.forceRegenerate);
    visualWorker.kick(); return reply.code(202).send(result);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/visuals/generate", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId,setVersion } = listeningSetParams.parse(request.params);
    const body = z.object({ forceRegenerate:z.boolean().default(false) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueVisualSet(admin.adminUserId,setId,setVersion,body.forceRegenerate);
    visualWorker.kick(); return reply.code(202).send(result);
  });

  app.delete("/v1/admin/listening/items/:itemId/versions/:itemVersion/visual-options/:optionNumber/assets/:visualAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { itemId,itemVersion,optionNumber,visualAssetId } = visualAssetParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteVisualAsset(itemId,itemVersion,optionNumber,visualAssetId,"choice",
      (bucket,path) => storage.removeObject(bucket,path));
  });

  app.post("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId,itemVersion } = readingItemParams.parse(request.params);
    const file = await request.file();
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new AppError(400, "IMAGE_REQUIRED", "A PNG, JPEG or WebP image is required");
    }
    const data = await file.toBuffer();
    const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const path = `reading/${itemId}/v${itemVersion}/material-${randomUUID()}.${extension}`;
    const storage = new SupabaseStorage();
    const uploaded = await storage.uploadMedia(path,data,file.mimetype);
    const result = await adminRepository.bindVisualAsset({
      adminUserId:admin.adminUserId,itemId,itemVersion,optionNumber:1,visualRole:"material",
      bucket:uploaded.bucket,path:uploaded.path,url:uploaded.url,mimeType:file.mimetype,byteSize:data.length,
    });
    for (const replaced of result.replacedAssets) {
      await adminRepository.removeSupersededVisualAsset(
        replaced.visual_asset_id,
        (bucket,objectPath) => storage.removeObject(bucket,objectPath),
      );
    }
    return reply.code(201).send(result);
  });

  app.post("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/generate", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { itemId,itemVersion } = readingItemParams.parse(request.params);
    const body = z.object({ forceRegenerate:z.boolean().default(false) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueReadingMaterial(
      admin.adminUserId,itemId,itemVersion,body.forceRegenerate,
    );
    visualWorker.kick(); return reply.code(202).send(result);
  });

  app.post("/v1/admin/reading/sets/:setId/versions/:setVersion/visuals/generate", async (request, reply) => {
    const admin = await requireAdmin(requireToken(request.headers.authorization));
    const { setId,setVersion } = readingSetParams.parse(request.params);
    const body = z.object({ forceRegenerate:z.boolean().default(false) }).parse(request.body ?? {});
    const result = await adminRepository.enqueueReadingVisualSet(
      admin.adminUserId,setId,setVersion,body.forceRegenerate,
    );
    visualWorker.kick(); return reply.code(202).send(result);
  });

  app.delete("/v1/admin/reading/items/:itemId/versions/:itemVersion/visual-material/assets/:visualAssetId", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { itemId,itemVersion,visualAssetId } = readingVisualAssetParams.parse(request.params);
    const storage = new SupabaseStorage();
    return adminRepository.deleteVisualAsset(
      itemId,itemVersion,1,visualAssetId,"material",
      (bucket,path) => storage.removeObject(bucket,path),
    );
  });

  app.put("/v1/admin/listening/mock-tests/:mockTestId/publish", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { mockTestId } = mockTestParams.parse(request.params);
    const body = z.object({ published: z.boolean() }).parse(request.body);
    return adminRepository.publishMockTest(mockTestId, body.published);
  });

  app.put("/v1/admin/mock-tests/:mockTestId/publish", async (request) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { mockTestId } = mockTestParams.parse(request.params);
    const body = z.object({ published: z.boolean() }).parse(request.body);
    return adminRepository.publishMockTest(mockTestId, body.published);
  });

  app.post("/v1/admin/question-sets/:setId/versions/:setVersion/revisions", async (request, reply) => {
    await requireAdmin(requireToken(request.headers.authorization));
    const { setId, setVersion } = questionSetRevisionParams.parse(request.params);
    const body = z.object({
      revisions: z.array(z.object({
        position: z.number().int().min(1).max(50),
        itemId: z.string().uuid(),
        itemVersion: z.number().int().positive(),
        stem: z.string().max(20_000),
        choices: z.array(z.string().max(5_000)).max(4),
        correctAnswer: z.number().int().min(1).max(4),
        explanation: z.string().max(20_000),
        contentJson: z.record(z.string(), z.unknown()),
      })).min(1).max(50),
    }).parse(request.body);
    return reply.code(201).send(await adminRepository.reviseQuestionSet(setId, setVersion, body.revisions));
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: error.issues },
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    if (isClientHttpError(error)) {
      return reply.code(error.statusCode).send({
        error: { code: error.code ?? "BAD_REQUEST", message: error.message },
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  return app;
}
