"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const rls_1 = require("../rls");
const multer_1 = __importDefault(require("multer"));
const r = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: process.env.UPLOAD_DIR || "uploads" });
// Create metadata field
r.post("/fields", async (req, res) => {
    const { tenantId } = (0, rls_1.ctx)(req);
    const { entity, field_type, label, options, required } = req.body;
    const q = await db_1.pool.query(`INSERT INTO metadata_field (tenant_id, entity, field_type, label, options, required)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [tenantId, entity, field_type, label, options || {}, required || false]);
    res.json(q.rows[0]);
});
// Get fields
r.get("/fields/:entity", async (req, res) => {
    const { tenantId } = (0, rls_1.ctx)(req);
    const { entity } = req.params;
    const q = await db_1.pool.query(`SELECT * FROM metadata_field WHERE tenant_id=$1 AND entity=$2`, [tenantId, entity]);
    res.json(q.rows);
});
// Upload file
r.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: "No file uploaded" });
    res.json({ filename: req.file.filename, original: req.file.originalname });
});
exports.default = r;
