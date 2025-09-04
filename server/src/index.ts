// server/src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import crmRoutes from "./routes/crm";
import metadataRoutes from "./routes/metadata";

dotenv.config();

const app = express();

// ✅ Allowed frontend origins
const allowedOrigins = [
  "https://geniusgrid-frontend.onrender.com",
  "http://localhost:3000", // local dev
];

// ✅ Strict CORS setup with credentials (cookies)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // 🔑 allow cookies
};

// ✅ Apply CORS + preflight
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ✅ Middleware
app.use(express.json());
app.use(cookieParser()); // 🔑 parse cookies

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
