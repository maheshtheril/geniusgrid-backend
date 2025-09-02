import { Router } from "express";
import { pool } from "../db";
import { ctx } from "../rls";

const r = Router();

// Leads
r.get("/leads", async (req, res) => {
  const { tenantId } = ctx(req);
  const q = await pool.query(`SELECT * FROM leads WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]);
  res.json(q.rows);
});

r.post("/leads", async (req, res) => {
  const { tenantId, companyId } = ctx(req);
  const { name, email, phone, source } = req.body;
  const q = await pool.query(
    `INSERT INTO leads (tenant_id, company_id, name, email, phone, source)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, companyId, name, email, phone, source]
  );
  res.json(q.rows[0]);
});

// Accounts
r.get("/accounts", async (req, res) => {
  const { tenantId } = ctx(req);
  const q = await pool.query(`SELECT * FROM accounts WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]);
  res.json(q.rows);
});

r.post("/accounts", async (req, res) => {
  const { tenantId, companyId } = ctx(req);
  const { name, industry } = req.body;
  const q = await pool.query(
    `INSERT INTO accounts (tenant_id, company_id, name, industry)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [tenantId, companyId, name, industry]
  );
  res.json(q.rows[0]);
});

// Deals
r.get("/deals", async (req, res) => {
  const { tenantId } = ctx(req);
  const q = await pool.query(`SELECT * FROM deals WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]);
  res.json(q.rows);
});

r.post("/deals", async (req, res) => {
  const { tenantId } = ctx(req);
  const { name, account_id, stage_id, amount } = req.body;
  const q = await pool.query(
    `INSERT INTO deals (tenant_id, account_id, name, stage_id, amount)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [tenantId, account_id, name, stage_id, amount]
  );
  res.json(q.rows[0]);
});

export default r;
