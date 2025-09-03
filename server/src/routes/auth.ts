import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { logAudit } from "../audit";

const r = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

// ================== SIGNUP ==================
r.post("/signup", async (req: Request, res: Response) => {
  const { tenantName, slug, region, plan, email, password, displayName } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Tenant
    const tenantRes = await client.query(
      `INSERT INTO tenant (name, slug, region, plan, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING tenant_id`,
      [tenantName, slug, region || "us", plan || "free"]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    // 2️⃣ Company
    const companyRes = await client.query(
      `INSERT INTO company (tenant_id, name)
       VALUES ($1,$2)
       RETURNING company_id`,
      [tenantId, `${tenantName} HQ`]
    );
    const companyId = companyRes.rows[0].company_id;

    // 3️⃣ Role (Admin)
    const roleRes = await client.query(
      `INSERT INTO role (tenant_id, name)
       VALUES ($1,'Admin')
       RETURNING role_id`,
      [tenantId]
    );
    const roleId = roleRes.rows[0].role_id;

    // 4️⃣ User (Admin)
    const hash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO app_user (tenant_id, company_id, email, password_hash, display_name, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       RETURNING user_id`,
      [tenantId, companyId, email, hash, displayName || "Admin User"]
    );
    const userId = userRes.rows[0].user_id;

    // 5️⃣ User-Role link
    await client.query(
      `INSERT INTO user_role (user_id, role_id) VALUES ($1,$2)`,
      [userId, roleId]
    );

    await client.query("COMMIT");

    // 🔑 Return token + user with role "Admin"
    const token = jwt.sign({ userId, tenantId, companyId }, JWT_SECRET, { expiresIn: "8h" });
    res.json({
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
    await client.query("ROLLBACK");
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ================== LOGIN ==================
r.post("/login", async (req: Request, res: Response) => {
  const { email, password, slug } = req.body;

  try {
    // 1. Validate tenant
    const tenantRes = await pool.query("SELECT tenant_id FROM tenant WHERE slug = $1", [slug]);
    if (tenantRes.rowCount === 0) {
      return res.status(401).json({ error: "Invalid tenant" });
    }
    const tenantId = tenantRes.rows[0].tenant_id;

    // 2. Find user in tenant
    const userRes = await pool.query(
      "SELECT * FROM app_user WHERE email = $1 AND tenant_id = $2",
      [email, tenantId]
    );
    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email" });
    }
    const user = userRes.rows[0];

    // 3. Check password
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 4. Fetch roles & normalize to "Admin"
    const roleRes = await pool.query(
      `SELECT r.name 
       FROM user_role ur
       JOIN role r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [user.user_id]
    );
    const roles = roleRes.rows.map((r) =>
      r.name.toLowerCase() === "administrator" ? "Admin" : r.name
    );

    // 5. Generate token
    const token = jwt.sign(
      { userId: user.user_id, tenantId: user.tenant_id, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        email: user.email,
        name: user.display_name,
        roles,
      },
      tenantId: user.tenant_id,
      slug,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================== PROFILE ==================
r.get("/profile", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token" });

    const token = authHeader.replace("Bearer ", "");
    const payload: any = jwt.verify(token, JWT_SECRET);

    const userRes = await pool.query(
      `SELECT u.user_id, u.email, u.display_name, 
              ARRAY_AGG(r.name) as roles
       FROM app_user u
       LEFT JOIN user_role ur ON u.user_id = ur.user_id
       LEFT JOIN role r ON ur.role_id = r.role_id
       WHERE u.user_id=$1
       GROUP BY u.user_id`,
      [payload.userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRes.rows[0];
    const roles = (user.roles || []).map((r: string) =>
      r && r.toLowerCase() === "administrator" ? "Admin" : r
    );

    res.json({
      userId: user.user_id,
      name: user.display_name,
      email: user.email,
      roles,
    });
  } catch (e: any) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default r;
