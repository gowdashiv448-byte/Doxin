import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireAdmin } from "../../plugins/auth.js";
import { DATASETS, importCsvStream } from "../../lib/importer.js";
import { badRequest } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { query, withTenant } from "../../db/index.js";

export default async function importRoutes(app: FastifyInstance) {
  app.get("/catalog", { preHandler: authenticate }, async () => ({
    datasets: Object.entries(DATASETS).map(([key, config]) => ({
      key,
      label: config.label,
      columns: config.columns,
      table: config.table,
    })),
  }));

  app.post("/:dataset", { preHandler: requireAdmin }, async (request, reply) => {
    const { dataset } = request.params as { dataset: string };
    if (!DATASETS[dataset]) throw badRequest("Unknown dataset");
    const file = await request.file();
    if (!file) throw badRequest("Attach a CSV file in the 'file' field");
    if (!file.filename.toLowerCase().endsWith(".csv")) throw badRequest("Only .csv files are accepted");
    const tenantId = request.tenantId;
    if (!tenantId) throw badRequest("Tenant context is required");
    const result = await withTenant(tenantId, (client) =>
      importCsvStream(client, tenantId, dataset, file.file),
    );
    await audit(request, {
      action: "IMPORT",
      entityType: "dataset",
      entityId: dataset,
      details: { ...result, filename: file.filename },
    });
    reply.status(201);
    return result;
  });

  app.get("/history", { preHandler: authenticate }, async (request) => {
    const limit = z.coerce.number().int().min(1).max(100).default(25).parse((request.query as { limit?: string }).limit ?? 25);
    const { rows } = await query(
      `SELECT id, actor_name, entity_id AS dataset, details, created_at FROM audit_logs
       WHERE action = 'IMPORT' ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return {
      data: rows.map((r) => ({
        id: String(r.id),
        actorName: r.actor_name,
        dataset: r.entity_id,
        ...(typeof r.details === "object" && r.details ? r.details : {}),
        createdAt: r.created_at,
      })),
    };
  });
}
