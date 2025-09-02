import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { logAudit } from "../audit";
import { Request, Response } from "express";


const r = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Signup (creates tenant, company, admin user)
r.post("/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, slug, email, password } = req.body;
    await client.query("BEGIN");

    const tenantRes = await client.query(
      `INSERT INTO tenant (name, slug, plan, status)
       VALUES ($1,$2,'standard','active')
       RETURNING tenant_id`,
      [name, slug]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    const companyRes = await client.query(
      `INSERT INTO company (tenant_id, name) VALUES ($1,$2) RETURNING company_id`,
      [tenantId, `${name} HQ`]
    );
    const companyId = companyRes.rows[0].company_id;

    const roleRes = await client.query(
      `INSERT INTO role (tenant_id, name) VALUES ($1,'Admin') RETURNING role_id`,
      [tenantId]
    );
    const roleId = roleRes.rows[0].role_id;

    const hash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO app_user (tenant_id, company_id, email, password_hash, display_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING user_id`,
      [tenantId, companyId, email, hash, "Admin User"]
    );
    const userId = userRes.rows[0].user_id;

    await client.query(
      `INSERT INTO user_role (user_id, role_id) VALUES ($1,$2)`,
      [userId, roleId]
    );

    await client.query("COMMIT");

    const token = jwt.sign({ userId, tenantId, companyId }, JWT_SECRET);
    res.json({ token });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Login
r.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const userRes = await pool.query(
    `SELECT u.*, t.slug
     FROM app_user u
     JOIN tenant t ON u.tenant_id = t.tenant_id
     WHERE email=$1`,
    [email]
  );

  if (userRes.rowCount === 0) return res.status(401).json({ error: "Invalid email" });
  const user = userRes.rows[0];

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid password" });

  const token = jwt.sign(
    { userId: user.user_id, tenantId: user.tenant_id, companyId: user.company_id },
    JWT_SECRET
  );

  res.json({ token, tenant: user.tenant_id, slug: user.slug });
});
// after login route
r.get("/profile", async (req, res) => {
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

    if (userRes.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userRes.rows[0];
    res.json({
      userId: user.user_id,
      name: user.display_name,
      email: user.email,
      roles: user.roles.filter((r: string) => r !== null),
    });
  } catch (e: any) {
    res.status(401).json({ error: "Invalid token" });
  }
});
r.post("/signup", async (req, res) => {
  const { tenantName, slug, region, plan, email, password, displayName } = req.body;

  try {
    // 1️⃣ Create tenant
    const tenantRes = await pool.query(
      `INSERT INTO tenant (name, slug, region, plan, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING tenant_id`,
      [tenantName, slug, region || "us", plan || "free"]
    );
    const tenantId = tenantRes.rows[0].tenant_id;

    // 2️⃣ Create default company
    const companyRes = await pool.query(
      `INSERT INTO company (tenant_id, name)
       VALUES ($1,$2)
       RETURNING company_id`,
      [tenantId, `${tenantName} HQ`]
    );
    const companyId = companyRes.rows[0].company_id;

    // 3️⃣ Create Admin role
    const roleRes = await pool.query(
      `INSERT INTO role (tenant_id, name)
       VALUES ($1,'Admin')
       RETURNING role_id`,
      [tenantId]
    );
    const roleId = roleRes.rows[0].role_id;

    // 4️⃣ Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    const userRes = await pool.query(
      `INSERT INTO app_user (tenant_id, company_id, email, password_hash, display_name, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       RETURNING user_id`,
      [tenantId, companyId, email, hash, displayName || "Admin User"]
    );
    const userId = userRes.rows[0].user_id;

    // 5️⃣ Link user to Admin role
    await pool.query(
      `INSERT INTO user_role (user_id, role_id) VALUES ($1,$2)`,
      [userId, roleId]
    );

    // 6️⃣ Seed default menu
    await pool.query(
      `INSERT INTO menu_item (tenant_id, label, path, icon, roles, order_index) VALUES
       ($1,'Dashboard','/dashboard','home','{Admin}',1),
       ($1,'CRM','/crm','users','{Admin,Sales}',2),
       ($1,'Admin','/admin','settings','{Admin}',3)`,
      [tenantId]
    );

    // 7️⃣ Seed default pipeline
    const pipeRes = await pool.query(
      `INSERT INTO pipelines (tenant_id, company_id, name)
       VALUES ($1,$2,'Sales Pipeline')
       RETURNING pipeline_id`,
      [tenantId, companyId]
    );
    const pipelineId = pipeRes.rows[0].pipeline_id;

    await pool.query(
      `INSERT INTO stages (tenant_id, company_id, pipeline_id, key, name, order_index, win_probability) VALUES
       ($1,$2,$3,'new','New',1,10),
       ($1,$2,$3,'qualified','Qualified',2,30),
       ($1,$2,$3,'proposal','Proposal',3,60),
       ($1,$2,$3,'won','Won',4,100),
       ($1,$2,$3,'lost','Lost',5,0)`,
      [tenantId, companyId, pipelineId]
    );

    // 8️⃣ Issue JWT token
    const token = jwt.sign({ userId, tenantId }, JWT_SECRET, { expiresIn: "8h" });

    await logAudit(pool, {
      tenant_id: tenantId,
      company_id: companyId,
      actor_id: userId,
      action: "CREATE",
      entity: "tenant",
      entity_id: tenantId,
      after_json: { tenantName, slug, email }
    });

    res.json({ token, tenantId, userId });
  } catch (err: any) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default r;
