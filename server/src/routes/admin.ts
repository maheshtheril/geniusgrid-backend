import { Router } from "express";
import { pool } from "../db";
import { ctx } from "../rls";
import { logAudit } from "../audit";
import { Request, Response } from "express";


const r = Router();

// List tenants
r.get("/tenants", async (_req, res) => {
  const q = await pool.query("SELECT * FROM tenant ORDER BY created_at DESC");
  res.json(q.rows);
});

// Create role
r.post("/roles", async (req, res) => {
  const { tenantId, actorId } = ctx(req);
  const { name } = req.body;
  const q = await pool.query(
    `INSERT INTO role (tenant_id, name) VALUES ($1,$2) RETURNING role_id`,
    [tenantId, name]
  );
  await logAudit(pool, { tenant_id: tenantId, actor_id: actorId ?? "system"
, action: "CREATE", entity: "role", entity_id: q.rows[0].role_id });
  res.json(q.rows[0]);
});

// Assign role
r.post("/user-role", async (req, res) => {
  const { user_id, role_id } = req.body;
  await pool.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user_id, role_id]);
  res.json({ success: true });
});

// Menu items
r.get("/menu", async (req, res) => {
  const { tenantId } = ctx(req);
  const q = await pool.query(
    `SELECT * FROM menu_item WHERE tenant_id=$1 ORDER BY order_index`,
    [tenantId]
  );
  res.json(q.rows);
});

r.post("/menu", async (req, res) => {
  const { tenantId } = ctx(req);
  const { parent_id, label, path, icon, order_index } = req.body;
  const q = await pool.query(
    `INSERT INTO menu_item (tenant_id, parent_id, label, path, icon, order_index)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING menu_id`,
    [tenantId, parent_id, label, path, icon, order_index]
  );
  res.json(q.rows[0]);
});

export default r;
