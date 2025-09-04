// server/src/middleware/requireAuth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export interface AuthRequest extends Request {
  user?: any;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // attach payload to req
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
