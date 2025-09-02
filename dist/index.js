"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const crm_1 = __importDefault(require("./routes/crm"));
const metadata_1 = __importDefault(require("./routes/metadata"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/uploads", express_1.default.static(process.env.UPLOAD_DIR || "uploads"));
app.use("/auth", auth_1.default);
app.use("/admin", admin_1.default);
app.use("/crm", crm_1.default);
app.use("/metadata", metadata_1.default);
const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
});
