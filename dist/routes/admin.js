"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const rls_1 = require("../rls");
const audit_1 = require("../audit");
const r = (0, express_1.Router)();
// List tenants
r.get("/tenants", async (_req, res) => {
    const q = await db_1.pool.query("SELECT * FROM tenant ORDER BY created_at DESC");
    res.json(q.rows);
});
// Create role
r.post("/roles", async (req, res) => {
    const { tenantId, actorId } = (0, rls_1.ctx)(req);
    const { name } = req.body;
    const q = await db_1.pool.query(`INSERT INTO role (tenant_id, name) VALUES ($1,$2) RETURNING role_id`, [tenantId, name]);
    await (0, audit_1.logAudit)(db_1.pool, { tenant_id: tenantId, actor_id: actorId, action: "CREATE", entity: "role", entity_id: q.rows[0].role_id });
    res.json(q.rows[0]);
});
// Assign role
r.post("/user-role", async (req, res) => {
    const { user_id, role_id } = req.body;
    await db_1.pool.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user_id, role_id]);
    res.json({ success: true });
});
// Menu items
r.get("/menu", async (req, res) => {
    const { tenantId } = (0, rls_1.ctx)(req);
    const q = await db_1.pool.query(`SELECT * FROM menu_item WHERE tenant_id=$1 ORDER BY order_index`, [tenantId]);
    res.json(q.rows);
});
r.post("/menu", async (req, res) => {
    const { tenantId } = (0, rls_1.ctx)(req);
    const { parent_id, label, path, icon, order_index } = req.body;
    const q = await db_1.pool.query(`INSERT INTO menu_item (tenant_id, parent_id, label, path, icon, order_index)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING menu_id`, [tenantId, parent_id, label, path, icon, order_index]);
    res.json(q.rows[0]);
});
exports.default = r;
