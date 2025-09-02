import { Request } from "express";

export function ctx(req: Request) {
  return {
    tenantId: req.headers["x-tenant-id"] as string,
    companyId: (req.headers["x-company-id"] as string) || null,
    actorId: (req.headers["x-user-id"] as string) || null,
  };
}
