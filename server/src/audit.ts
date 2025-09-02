import { PoolClient } from "pg";

export async function logAudit(
  client: PoolClient,
  {
    tenant_id,
    company_id,
    actor_id,
    action,
    entity,
    entity_id,
    before_json,
    after_json,
  }: any
) {
  await client.query(
    `INSERT INTO audit_log
     (tenant_id, company_id, actor_id, action, entity, entity_id, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      tenant_id,
      company_id,
      actor_id,
      action,
      entity,
      entity_id,
      before_json || null,
      after_json || null,
    ]
  );
}
