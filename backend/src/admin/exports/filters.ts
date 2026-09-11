import { z } from "zod";
import { AppError } from "../../core/errors.js";
import type { AdminExportDataset, AdminExportFilters } from "./types.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

const exportFilterSchema = z.object({
  mockTestId: z.string().uuid().optional(),
  section: z.enum(["reading", "listening"]).optional(),
  mode: z.enum(["timed", "practice"]).optional(),
  status: z.enum(["submitted", "abandoned", "all"]).default("submitted"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  itemType: z.string().trim().min(1).max(100).optional(),
  minAssignedCount: z.coerce.number().int().min(0).max(1_000_000).default(0),
  outcome: z.enum(["all", "answered", "correct", "incorrect", "unanswered"]).default("all"),
  rating: z.enum(["all", "none", "1", "2", "3", "4", "5"]).default("all"),
  resultEmail: z.enum(["all", "accepted", "not_accepted"]).default("all"),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after start date" });
  }
});

export function parseAdminExportFilters(input: unknown, dataset?: AdminExportDataset): AdminExportFilters {
  const result = exportFilterSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, "INVALID_EXPORT_FILTER", "Invalid export filters");
  }
  if (dataset === "questions") {
    return { ...result.data, outcome: "all", rating: "all", resultEmail: "all" };
  }
  if (dataset === "responses") {
    return { ...result.data, itemType: undefined, minAssignedCount: 0, rating: "all", resultEmail: "all" };
  }
  if (dataset === "sessions") {
    return { ...result.data, itemType: undefined, minAssignedCount: 0, outcome: "all" };
  }
  return result.data;
}

