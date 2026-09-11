import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { AdminExportRepository, type AdminExportSource } from "./admin/export.js";
import { AdminRepository } from "./admin/repository.js";
import { config } from "./core/config.js";
import { AppError } from "./core/errors.js";
import { BrevoResultEmailSender, type ResultEmailSender } from "./email/brevo-result-email.js";
import { TopikRepository } from "./exam/repository.js";
import { registerAdminContentRoutes } from "./routes/admin/content-routes.js";
import { registerAdminCoreRoutes } from "./routes/admin/core-routes.js";
import { registerAdminExportRoutes } from "./routes/admin/export-routes.js";
import { registerAdminMediaRoutes, ttsStyleSchema } from "./routes/admin/media-routes.js";
import { registerAdminResponseRoutes } from "./routes/admin/response-routes.js";
import { registerPublicRoutes } from "./routes/public-routes.js";

export { ttsStyleSchema };

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

  registerPublicRoutes(app, repository, resultEmailSender);
  registerAdminCoreRoutes(app, adminRepository);
  registerAdminResponseRoutes(app, adminRepository);
  registerAdminExportRoutes(app, adminExportRepository);
  registerAdminMediaRoutes(app, adminRepository);
  registerAdminContentRoutes(app, adminRepository);

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
