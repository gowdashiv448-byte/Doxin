import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { query } from "../db/index.js";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

/** Append-only audit trail. Never let audit failures break a successful write. */
export async function audit(
  request: FastifyRequest,
  input: AuditInput,
  client?: pg.PoolClient,
): Promise<void> {
  try {
    const sql = `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`;
    const params = [
      request.user?.id ?? null,
      request.user?.name ?? "system",
      input.action,
      input.entityType,
      input.entityId,
      input.details ? JSON.stringify(input.details) : null,
    ];
    if (client) await client.query(sql, params);
    else await query(sql, params);
  } catch (error) {
    request.log.error({ err: error, audit: input }, "Failed to write audit log");
  }
}
