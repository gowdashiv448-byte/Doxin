import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function paginate(p: Pagination) {
  return {
    limit: p.pageSize,
    offset: (p.page - 1) * p.pageSize,
  };
}

export function pageResult<T>(data: T[], total: number, p: Pagination) {
  return {
    data,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Map a user-supplied sort field to a whitelisted column. */
export function safeSort(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sort) return fallback;
  return allowed[sort] ?? fallback;
}

export function dateRangeSchema() {
  return z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  });
}

export const idParamSchema = z.object({ id: z.string().min(1) });
