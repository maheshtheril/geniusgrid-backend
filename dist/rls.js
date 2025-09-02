"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ctx = ctx;
function ctx(req) {
    return {
        tenantId: req.headers["x-tenant-id"],
        companyId: req.headers["x-company-id"] || null,
        actorId: req.headers["x-user-id"] || null,
    };
}
