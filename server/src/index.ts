// server/src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import crmRoutes from "./routes/crm";
import metadataRoutes from "./routes/metadata";
import { requireAuth } from "./middleware/requireAuth";

dotenv.config();

const app = express();

// ✅ Allowed frontend origins (Render FE + local dev)
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://geniusgrid-frontend.onrender.com",
  "http://localhost:3000",
];

// ✅ CORS (must be before routes)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // ok with Authorization header as well
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
  })
);

// ✅ Handle preflight OPTIONS for all routes
app.options(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Body parser
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
app.use("/auth", authRoutes);                // public endpoints
app.use("/admin", requireAuth, adminRoutes); // protected
app.use("/crm", requireAuth, crmRoutes);     // protected
app.use("/metadata", metadataRoutes);        // public/adjust as needed

// ✅ Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ Backend running on port ${port}`);
});
