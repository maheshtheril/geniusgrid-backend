// server/src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import crmRoutes from "./routes/crm";
import metadataRoutes from "./routes/metadata";

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ✅ Static file serving (uploads)
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "uploads"));

// ✅ Routes
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/crm", crmRoutes);
app.use("/metadata", metadataRoutes);

// ✅ Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
