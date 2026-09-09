import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../admin-auth.js";
import type { AdminRepository } from "../admin-repository.js";
import { requireSessionToken } from "./route-auth.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });

export function registerAdminResponseRoutes(app: FastifyInstance, repository: AdminRepository) {
  app.get("/v1/admin/responses/sessions", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const query = z.object({
      section: z.enum(["reading", "listening"]).optional(),
      correctness: z.enum(["correct", "incorrect", "unanswered"]).optional(),
      status: z.enum(["submitted", "abandoned"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(50),
    }).parse(request.query);
    return repository.listResponseSessions(query);
  });

  app.get("/v1/admin/responses/sessions/:sessionId", async (request) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { sessionId } = sessionParams.parse(request.params);
    return repository.getResponseSession(sessionId);
  });

  app.delete("/v1/admin/responses/sessions", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const body = z.object({ sessionIds: z.array(z.string().uuid()).min(1).max(100) }).parse(request.body);
    return repository.deleteResponseSessions(admin.adminUserId, [...new Set(body.sessionIds)]);
  });

  app.delete("/v1/admin/responses/sessions/all", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    z.object({ confirmation: z.literal("전체 응답 삭제") }).parse(request.body);
    return repository.deleteResponseSessions(admin.adminUserId, "all");
  });

  app.delete("/v1/admin/responses/sessions/abandoned/all", async (request) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    z.object({ confirmation: z.literal("폐기 세션 전체 삭제") }).parse(request.body);
    return repository.deleteResponseSessions(admin.adminUserId, "abandoned");
  });
}
