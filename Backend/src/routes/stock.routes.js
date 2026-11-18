import { Router } from "express";
import mongoose from "mongoose";
import Stock from "../models/Stock.js";
import StockTransaction from "../models/StockTransaction.js";
import Warehouse from "../models/Warehouse.js";
import Product from "../models/Product.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);
const managedWarehouseFilter = user => user.role === "admin" ||
  user.role === "salesRepresentative" && user.assignedWarehouses.length === 0
  ? {}
  : { warehouse: { $in: user.assignedWarehouses } };

router.get("/low", asyncHandler(async (req, res) => {
  const rows = await Stock.find(managedWarehouseFilter(req.user))
    .populate("product", "name sku category price lowStockLimit imageUrl")
    .populate("warehouse", "name location");
  res.json({ stock: rows.filter(row => row.product && row.quantity <= row.product.lowStockLimit) });
}));

router.get("/", asyncHandler(async (req, res) => {
  const warehouseFilter = managedWarehouseFilter(req.user);
  const [stock, transactions] = await Promise.all([
    Stock.find(warehouseFilter).populate("product", "name sku category price lowStockLimit imageUrl").populate("warehouse", "name location"),
    StockTransaction.find(warehouseFilter).sort({ date: -1 }).limit(50)
      .populate("product", "name sku").populate("warehouse", "name").populate("performedBy", "name")
  ]);
  res.json({ stock, transactions });
}));

async function adjustStock(req, res, transactionType) {
  const { product, warehouse, quantity, note } = req.body;
  const amount = Number(quantity);
  if (!mongoose.isValidObjectId(product) || !mongoose.isValidObjectId(warehouse) || !Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ message: "Select a valid product and warehouse and enter a positive whole-number quantity" });
  }
  if (req.user.role !== "admin" && !req.user.assignedWarehouses.some(id => id.toString() === warehouse)) {
    return res.status(403).json({ message: "Warehouse is not assigned to your account" });
  }
  if (!(await Product.exists({ _id: product }))) return res.status(404).json({ message: "Product not found" });
  if (!(await Warehouse.exists({ _id: warehouse }))) return res.status(404).json({ message: "Warehouse not found" });

  const session = await mongoose.startSession();
  let record;
  let transaction;
  try {
    await session.withTransaction(async () => {
      if (transactionType === "stock-in") {
        record = await Stock.findOneAndUpdate(
          { product, warehouse },
          { $inc: { quantity: amount }, $setOnInsert: { product, warehouse } },
          { upsert: true, returnDocument: "after", runValidators: true, session }
        );
      } else {
        record = await Stock.findOneAndUpdate(
          { product, warehouse, quantity: { $gte: amount } },
          { $inc: { quantity: -amount } },
          { returnDocument: "after", session }
        );
        if (!record) {
          const error = new Error("Insufficient stock for this operation");
          error.status = 409;
          throw error;
        }
      }
      [transaction] = await StockTransaction.create([{
        product, warehouse, transactionType, quantity: amount, note, performedBy: req.user._id
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  await Promise.all([record.populate(["product", "warehouse"]), transaction.populate(["product", "warehouse", "performedBy"])]);
  return res.status(201).json({ stock: record, transaction });
}

router.post("/in", allowRoles("admin", "warehouseManager"), asyncHandler((req, res) => adjustStock(req, res, "stock-in")));
router.post("/out", allowRoles("admin", "warehouseManager"), asyncHandler((req, res) => adjustStock(req, res, "stock-out")));
router.post("/adjust", allowRoles("admin", "warehouseManager"), asyncHandler((req, res) => {
  const type = req.body.transactionType;
  if (!["stock-in", "stock-out"].includes(type)) return res.status(400).json({ message: "Invalid transaction type" });
  return adjustStock(req, res, type);
}));

export default router;
