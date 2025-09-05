"use strict";
const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { logAudit } = require("../audit");

const r = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set. Set it in env for production!");
}

// Utility to create a token with a consistent payload and expiry
function makeToken(payload) {
  // use 8h expiry for auth tokens (tune as you like)
  return jwt.sign(payload, JWT_SECRET || "dev-secret", { expiresIn: "8h" });
}

/**
 * Single consolidated /signup that:
 *  - Creates tenant -> company -> role -> user -> user_role
 *  - Seeds basic menu & pipeline
 *  - Returns token + tenantId + userId
 */
r.post("/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    const { tenantName, slug, region, plan, email, password, displayName } = req.body;
    if (!tenantName || !slug || !email || !password) {
      return res.status(400).json({ error: "tenantName, slug, email and password required" });
    }

    await client.query("BEGIN");

    const tenantRes = await client.query(
      `INSERT INTO tenant (name, slug, region, plan, status)
       VALUES ($1,$2,$3,$4,'active') RETURNING tenant_id`,
      [tenantName, slug, region || "us", plan || "free"]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    const companyRes = await client.query(
      `INSERT INTO company (tenant_id, name) VALUES ($1,$2) RETURNING company_id`,
      [tenantId, `${tenantName} HQ`]
    );
    const companyId = companyRes.rows[0].company_id;

    const roleRes = await client.query(
      `INSERT INTO role (tenant_id, name) VALUES ($1,'Admin') RETURNING role_id`,
      [tenantId]
    );
    const roleId = roleRes.rows[0].role_id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO app_user (tenant_id, company_id, email, password_hash, display_name, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING user_id`,
      [tenantId, companyId, email, hash, displayName || "Admin User"]
    );
    const userId = userRes.rows[0].user_id;

    await client.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2)`, [userId, roleId]);

    // seed menu (example) — adjust as needed
    await client.query(
      `INSERT INTO menu_item (tenant_id, label, path, icon, roles, order_index) VALUES
       ($1,'Dashboard','/dashboard','home','{Admin}',1),
       ($1,'CRM','/crm','users','{Admin,Sales}',2),
       ($1,'Admin','/admin','settings','{Admin}',3)`,
      [tenantId]
    );

    // seed pipeline and stages
    const pipeRes = await client.query(
      `INSERT INTO pipelines (tenant_id, company_id, name)
       VALUES ($1,$2,'Sales Pipeline') RETURNING pipeline_id`,
      [tenantId, companyId]
    );
    const pipelineId = pipeRes.rows[0].pipeline_id;

    await client.query(
      `INSERT INTO stages (tenant_id, company_id, pipeline_id, key, name, order_index, win_probability) VALUES
       ($1,$2,$3,'new','New',1,10),
       ($1,$2,$3,'qualified','Qualified',2,30),
       ($1,$2,$3,'proposal','Proposal',3,60),
       ($1,$2,$3,'won','Won',4,100),
       ($1,$2,$3,'lost','Lost',5,0)`,
      [tenantId, companyId, pipelineId]
    );

    // audit log (non-blocking if it fails)
    try {
      await logAudit(pool, {
        tenant_id: tenantId,
        company_id: companyId,
        actor_id: userId,
        action: "CREATE",
        entity: "tenant",
        entity_id: tenantId,
        after_json: { tenantName, slug, email },
      });
    } catch (ae) {
      console.warn("audit log failed", ae);
    }

    await client.query("COMMIT");

    const token = makeToken({ userId, tenantId, companyId });
    return res.json({ token, tenantId, userId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Signup error:", err);
    return res.status(500).json({ error: err.message || "Signup failed" });
  } finally {
    client.release();
  }
});

/**
 * Login: verifies credentials and returns { token, tenantId, slug }
 * - Standardize the response as token (string)
 */
r.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email & password required" });

    const userRes = await pool.query(
      `SELECT u.*, t.slug
       FROM app_user u
       JOIN tenant t ON u.tenant_id = t.tenant_id
       WHERE email=$1`,
      [email]
    );

    if (userRes.rowCount === 0) return res.status(401).json({ error: "Invalid email or password" });

    const user = userRes.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = makeToken({ userId: user.user_id, tenantId: user.tenant_id, companyId: user.company_id });
    return res.json({ token, tenantId: user.tenant_id, slug: user.slug });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: err.message || "Login failed" });
  }
});

/**
 * Profile: requires Authorization header "Bearer <token>"
 * - Robust header parsing, verify token, return user basic info + roles array
 */
r.get("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No Authorization header" });

    const parts = authHeader.split(" ");
    if (parts.length !== 2) return res.status(401).json({ error: "Bad Authorization header format" });
    const token = parts[1];

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET || "dev-secret");
    } catch (ve) {
      console.warn("Token verify failed:", ve);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // payload should contain userId
    const userId = payload.userId || payload.sub;
    if (!userId) return res.status(401).json({ error: "Invalid token payload" });

    const userRes = await pool.query(
      `SELECT u.user_id, u.email, u.display_name,
              ARRAY_AGG(r.name) as roles
       FROM app_user u
       LEFT JOIN user_role ur ON u.user_id = ur.user_id
       LEFT JOIN role r ON ur.role_id = r.role_id
       WHERE u.user_id=$1
       GROUP BY u.user_id`,
      [userId]
    );

    if (userRes.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userRes.rows[0];
    const roles = (user.roles || []).filter(Boolean); // remove nulls
    return res.json({
      userId: user.user_id,
      name: user.display_name,
      email: user.email,
      roles,
    });
  } catch (err) {
    console.error("Profile error:", err);
    return res.status(500).json({ error: "Failed to get profile" });
  }
});

module.exports = r;
