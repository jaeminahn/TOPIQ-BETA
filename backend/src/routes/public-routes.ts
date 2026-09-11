import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ResultEmailSender } from "../brevo-result-email.js";
import { brevoQuotaWarningWorker } from "../brevo-quota-warning-worker.js";
import { AppError } from "../errors.js";
import type { TopikRepository } from "../repository.js";
import { requireResultToken, requireSessionToken } from "./route-auth.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });
const itemParams = sessionParams.extend({ itemOrder: z.coerce.number().int().min(1).max(100) });
const audioParams = sessionParams.extend({ audioAssetId: z.string().uuid() });

export function registerPublicRoutes(
  app: FastifyInstance,
  repository: TopikRepository,
  resultEmailSender: ResultEmailSender,
) {
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
    return repository.getSession(sessionId, requireSessionToken(request.headers.authorization));
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
      token: requireSessionToken(request.headers.authorization),
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
      token: requireSessionToken(request.headers.authorization),
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
      sessionId,
      audioAssetId,
      token: requireSessionToken(request.headers.authorization),
      ...body,
    });
  });

  app.post("/v1/sessions/:sessionId/submit", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.submitSession(sessionId, requireSessionToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/abandon", async (request) => {
    const { sessionId } = sessionParams.parse(request.params);
    return repository.abandonSession(sessionId, requireSessionToken(request.headers.authorization));
  });

  app.post("/v1/sessions/:sessionId/result-email", async (request, reply) => {
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
      token: requireSessionToken(request.headers.authorization),
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
      const marked = await repository.markResultEmailAccepted(prepared.deliveryId, messageId);
      if (marked?.warningQueued) brevoQuotaWarningWorker.kick();
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
}
