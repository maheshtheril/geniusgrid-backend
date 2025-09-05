// routes/auth.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db";
import { logAudit } from "../audit";

const r = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret"; // set real secret in env in production

// ===== DEBUG (temporary) =====
// Returns only sha256(JWT_SECRET) — safe to expose short-term for debugging.
// REMOVE this route after you finish debugging.
r.get("/_debug/secret-hash", (req: Request, res: Response) => {
  try {
    const s = process.env.JWT_SECRET || "";
    const h = crypto.createHash("sha256").update(s).digest("hex");
    return res.json({ ok: true, sha256: h });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Utility: create JWT token (consistent payload + expiry)
function makeToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

// ================== SIGNUP ==================
r.post("/signup", async (req: Request, res: Response) => {
  const { tenantName, slug, region, plan, email, password, displayName } = req.body;
  const client = await pool.connect();

  try {
    if (!tenantName || !slug || !email || !password) {
      return res.status(400).json({ error: "tenantName, slug, email and password are required" });
    }

    await client.query("BEGIN");

    const tenantRes = await client.query(
      `INSERT INTO tenant (name, slug, region, plan, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING tenant_id`,
      [tenantName, slug, region || "us", plan || "free"]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    const companyRes = await client.query(
      `INSERT INTO company (tenant_id, name)
       VALUES ($1,$2)
       RETURNING company_id`,
      [tenantId, `${tenantName} HQ`]
    );
    const companyId = companyRes.rows[0].company_id;

    const roleRes = await client.query(
      `INSERT INTO role (tenant_id, key, name, permissions)
       VALUES ($1,'admin','Administrator',ARRAY['*'])
       RETURNING role_id`,
      [tenantId]
    );
    const roleId = roleRes.rows[0].role_id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO app_user (tenant_id, company_id, email, password_hash, display_name, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       RETURNING user_id`,
      [tenantId, companyId, email, hash, displayName || "Admin User"]
    );
    const userId = userRes.rows[0].user_id;

    await client.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2)`, [userId, roleId]);

    await client.query("COMMIT");

    const token = makeToken({ userId, tenantId, companyId });

    // optional audit — best-effort
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

    return res.json({
      success: true,
      token,
      user: {
        id: userId,
        email,
        name: displayName || "Admin User",
        roles: ["Admin"],
      },
      tenantId,
      slug,
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Signup error:", err);
    return res.status(500).json({ error: err.message || "Signup failed" });
  } finally {
    client.release();
  }
});

// ================== LOGIN ==================
r.post("/login", async (req: Request, res: Response) => {
  const { email, password, slug } = req.body;

  try {
    if (!email || !password || !slug) {
      return res.status(400).json({ error: "email, password and slug required" });
    }

    const tenantRes = await pool.query("SELECT tenant_id FROM tenant WHERE slug=$1", [slug]);
    if (!tenantRes.rowCount) return res.status(401).json({ error: "Invalid tenant" });
    const tenantId = tenantRes.rows[0].tenant_id;

    const userRes = await pool.query(
      "SELECT * FROM app_user WHERE email=$1 AND tenant_id=$2 AND status='active'",
      [email, tenantId]
    );
    if (!userRes.rowCount) return res.status(401).json({ error: "Invalid email or password" });

    const user = userRes.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const roleRes = await pool.query(
      `SELECT r.key, r.name, r.permissions
       FROM user_role ur
       JOIN role r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [user.user_id]
    );

    const token = makeToken({ userId: user.user_id, tenantId: user.tenant_id });

    return res.json({
      success: true,
      token,
      user: {
        id: user.user_id,
        email: user.email,
        name: user.display_name,
        roles: roleRes.rows,
      },
      tenantId: user.tenant_id,
      slug,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ================== PROFILE ==================
// safe /profile handler — replace existing handler
r.get("/profile", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader ?? null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (ve: any) {
      console.error("JWT verify failed:", { name: ve.name, message: ve.message });
      return res.status(401).json({ error: "Invalid token", details: ve.message });
    }

    // safer: get roles and permissions in separate/robust subquery to avoid unnest issues
    const q = `
      SELECT u.user_id, u.email, u.display_name
      FROM app_user u
      WHERE u.user_id = $1
    `;
    const ures = await pool.query(q, [payload.userId]);
    if (!ures.rowCount) return res.status(404).json({ error: "User not found" });

    // roles array
    const rolesRes = await pool.query(
      `SELECT COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM user_role ur
       JOIN role r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [payload.userId]
    );

    // permissions via subquery that unnests only role.permissions for that user
    const permsRes = await pool.query(
      `SELECT COALESCE(array_agg(DISTINCT p) , ARRAY[]::text[]) AS permissions
       FROM (
         SELECT unnest(r.permissions) AS p
         FROM user_role ur
         JOIN role r ON ur.role_id = r.role_id
         WHERE ur.user_id = $1 AND r.permissions IS NOT NULL
       ) sub`,
      [payload.userId]
    );

    const user = ures.rows[0];
    const roles = rolesRes.rows[0]?.roles || [];
    const permissions = permsRes.rows[0]?.permissions || [];

    return res.json({
      id: user.user_id,
      email: user.email,
      name: user.display_name,
      roles,
      permissions,
    });
  } catch (err: any) {
    // <-- IMPORTANT: full error logged for debugging (check Render logs)
    console.error("Profile error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Failed to get profile" });
  }
});


// ================== LOGOUT ==================
r.post("/logout", (req: Request, res: Response) => {
  // JWT stored in client localStorage → logout is FE-only; server can optionally blacklist if implemented.
  return res.json({ success: true, message: "Clear token from localStorage" });
});

export default r;
