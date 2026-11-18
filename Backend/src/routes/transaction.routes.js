import { Router } from "express";
import StockTransaction from "../models/StockTransaction.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { warehouse: { $in: req.user.assignedWarehouses } };
  const transactions = await StockTransaction.find(filter).sort({ date: -1 }).limit(200)
    .populate("product", "name sku").populate("warehouse", "name").populate("performedBy", "name");
  res.json({ transactions });
}));

export default router;
