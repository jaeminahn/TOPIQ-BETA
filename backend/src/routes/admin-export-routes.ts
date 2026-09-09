import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../admin-auth.js";
import {
  adminExportDatasets,
  exportFilename,
  parseAdminExportFilters,
  type AdminExportSource,
} from "../admin-export.js";
import { requireSessionToken } from "./route-auth.js";

const adminExportParams = z.object({ dataset: z.enum(adminExportDatasets) });

export function registerAdminExportRoutes(app: FastifyInstance, repository: AdminExportSource) {
  app.get("/v1/admin/exports/options", async (request, reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    reply.header("Cache-Control", "no-store");
    return repository.options();
  });

  app.get("/v1/admin/exports/:dataset/preview", async (request, reply) => {
    await requireAdmin(requireSessionToken(request.headers.authorization));
    const { dataset } = adminExportParams.parse(request.params);
    const filters = parseAdminExportFilters(request.query, dataset);
    const preview = await repository.preview(dataset, filters);
    reply.header("Cache-Control", "no-store");
    return { ...preview, filters, generatedAt: new Date().toISOString() };
  });

  app.get("/v1/admin/exports/:dataset.csv", async (request, reply) => {
    const admin = await requireAdmin(requireSessionToken(request.headers.authorization));
    const { dataset } = adminExportParams.parse(request.params);
    const filters = parseAdminExportFilters(request.query, dataset);
    const preview = await repository.preview(dataset, filters);
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
    const stream = repository.csvStream(dataset, filters);
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
}
