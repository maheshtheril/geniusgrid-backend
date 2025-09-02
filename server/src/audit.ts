import { Pool, PoolClient } from "pg";

interface AuditLogEntry {
  tenant_id: string;
  company_id?: string | null;
  actor_id: string | null;   // ⬅ allow null
  action: string;
  entity: string;
  entity_id: string;
  before_json?: any;
  after_json?: any;
}


export async function logAudit(c: Pool | PoolClient, entry: AuditLogEntry) {
  const client = "query" in c ? c : (c as PoolClient);
  await client.query(
    `INSERT INTO audit_log
     (tenant_id, company_id, actor_id, action, entity, entity_id, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.tenant_id,
      entry.company_id || null,
      entry.actor_id,
      entry.action,
      entry.entity,
      entry.entity_id,
      entry.before_json || null,
      entry.after_json || null,
    ]
  );
}
