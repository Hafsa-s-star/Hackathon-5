import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import productRoutes from "./routes/product.routes.js";
import warehouseRoutes from "./routes/warehouse.routes.js";
import stockRoutes from "./routes/stock.routes.js";
import orderRoutes from "./routes/order.routes.js";
import supplyRoutes from "./routes/supply.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import errorHandler from "./middleware/errorHandler.js";
import connectDB from "./config/db.js";

const app = express();
const clientOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => new URL(value).origin);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || clientOrigins.includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.get("/api/health", async (_req, res) => {
  await connectDB();
  res.json({ status: "ok" });
});
app.use("/api", async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/supply-requests", supplyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/upload", uploadRoutes);
app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

export default app;
