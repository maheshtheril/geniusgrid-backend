"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
async function logAudit(c, entry) {
    const client = "query" in c ? c : c;
    await client.query(`INSERT INTO audit_log
     (tenant_id, company_id, actor_id, action, entity, entity_id, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
        entry.tenant_id,
        entry.company_id || null,
        entry.actor_id,
        entry.action,
        entry.entity,
        entry.entity_id,
        entry.before_json || null,
        entry.after_json || null,
    ]);
}
