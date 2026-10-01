import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export const preregistrationFiltersSchema = z.object({
  source: z.enum(["landing", "topik_result"]).optional(),
  deduplicate: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().max(320).default(""),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  path: ["to"], message: "End date must be on or after start date",
});

export type PreregistrationFilters = z.output<typeof preregistrationFiltersSchema>;
export const preregistrationPagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
