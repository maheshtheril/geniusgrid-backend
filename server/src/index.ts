import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import crmRoutes from "./routes/crm";
import metadataRoutes from "./routes/metadata";
import { requireAuth } from "./middleware/requireAuth";

dotenv.config();

const app = express();

// ✅ Allowed frontend origins
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
];

// ✅ Strict CORS setup (JWT in Authorization header, no cookies needed)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // allow Authorization header
};

// ✅ Apply CORS + preflight
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ✅ Middleware
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
app.use("/auth", authRoutes);                        // public
app.use("/admin", requireAuth, adminRoutes);         // protected
app.use("/crm", requireAuth, crmRoutes);             // protected
app.use("/metadata", metadataRoutes);                // maybe public, adjust if needed

// ✅ Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ Backend running on port ${port}`);
});
