import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    companyId: string;
    roles: string[];
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token =
      req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token" });
    }

    const payload: any = jwt.verify(token, JWT_SECRET);

    // Fetch user + roles from DB
    const userRes = await pool.query(
      `SELECT u.user_id, u.tenant_id, u.company_id, u.email, u.display_name,
              ARRAY_AGG(r.name) AS roles
       FROM app_user u
       LEFT JOIN user_role ur ON u.user_id = ur.user_id
       LEFT JOIN role r ON ur.role_id = r.role_id
       WHERE u.user_id = $1
       GROUP BY u.user_id`,
      [payload.userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    const user = userRes.rows[0];
    const roles = (user.roles || []).map((r: string) =>
      r && r.toLowerCase() === "administrator" ? "Admin" : r
    );

    req.user = {
      id: user.user_id,
      tenantId: user.tenant_id,
      companyId: user.company_id,
      roles,
    };

    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
