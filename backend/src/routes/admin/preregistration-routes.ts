import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../admin/auth.js";
import { preregistrationFiltersSchema, preregistrationPagingSchema } from "../../admin/preregistrations/filters.js";
import type { AdminPreregistrationRepository } from "../../admin/preregistrations/repository.js";
import { requireSessionToken } from "../route-auth.js";

export function registerAdminPreregistrationRoutes(app: FastifyInstance, repository: AdminPreregistrationRepository) {
  app.get("/v1/admin/preregistrations", async (request, reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    reply.header("Cache-Control", "no-store");
    return repository.list(preregistrationFiltersSchema.parse(request.query), preregistrationPagingSchema.parse(request.query));
  });

  app.get("/v1/admin/preregistrations.csv", async (request, reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const filters = preregistrationFiltersSchema.parse(request.query);
    reply.header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="unigate_preregistrations_${Date.now()}.csv"`)
      .type("text/csv; charset=utf-8");
    return reply.send(repository.csvStream(filters));
  });

  app.delete("/v1/admin/preregistrations/:registrationId", async (request, reply) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { registrationId } = z.object({ registrationId: z.string().regex(/^00[123]-\d{8,19}$/) }).parse(request.params);
    await repository.delete(admin.adminUserId, registrationId);
    return reply.header("Cache-Control", "no-store").code(204).send();
  });
}
