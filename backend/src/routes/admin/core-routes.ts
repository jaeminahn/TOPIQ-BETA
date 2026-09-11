import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminLogin, requireAdmin } from "../../admin/auth.js";
import type { AdminRepository } from "../../admin/repository.js";
import { requireSessionToken } from "../route-auth.js";

const setParams = z.object({ setId: z.string().uuid() });
const legacySetParams = setParams.extend({ setVersion: z.coerce.number().int().positive() });

export function registerAdminCoreRoutes(app: FastifyInstance, repository: AdminRepository) {
  app.get("/v1/admin/me", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    return { admin: { id: admin.adminUserId, email: admin.email } };
  });

  app.post("/v1/admin/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (request) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(12).max(200) }).parse(request.body);
    return adminLogin(body.email, body.password);
  });

  app.get("/v1/admin/dashboard", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    return { summary: await repository.dashboard() };
  });

  app.put("/v1/admin/email/settings", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    return repository.setResultEmailEnabled(admin.adminUserId, body.enabled);
  });

  app.get("/v1/admin/listening/items", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      status: z.enum(["ready", "missing", "failed"]).optional(),
    }).parse(request.query);
    return { items: await repository.listListeningItems(query.setId, query.status) };
  });

  app.get("/v1/admin/listening/sets", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    return { sets: await repository.listListeningSets() };
  });

  app.post("/v1/admin/listening/sets/:setId/register", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId } = setParams.parse(request.params);
    return repository.registerListeningSet(setId);
  });

  app.post("/v1/admin/listening/sets/:setId/versions/:setVersion/register", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId } = legacySetParams.parse(request.params);
    return repository.registerListeningSet(setId);
  });

  app.get("/v1/admin/reading/items", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const query = z.object({
      setId: z.string().uuid().optional(),
      search: z.string().trim().max(100).optional(),
    }).parse(request.query);
    return { items: await repository.listReadingItems(query.setId, query.search) };
  });

  app.get("/v1/admin/reading/sets", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    return { sets: await repository.listReadingSets() };
  });

  app.post("/v1/admin/reading/sets/:setId/publish", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId } = setParams.parse(request.params);
    return repository.publishReadingSet(setId);
  });

  app.post("/v1/admin/reading/sets/:setId/versions/:setVersion/publish", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { setId } = legacySetParams.parse(request.params);
    return repository.publishReadingSet(setId);
  });

  app.get("/v1/admin/tts/jobs", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    return { jobs: await repository.listJobs(query.limit) };
  });
}
