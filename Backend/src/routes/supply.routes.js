import { Router } from "express";
import mongoose from "mongoose";
import SupplyRequest from "../models/SupplyRequest.js";
import Stock from "../models/Stock.js";
import StockTransaction from "../models/StockTransaction.js";
import Warehouse from "../models/Warehouse.js";
import Product from "../models/Product.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const filter = req.user.role === "admin" ? {} : req.user.role === "supplier"
    ? { supplier: req.user._id }
    : { warehouse: { $in: req.user.assignedWarehouses } };
  const requests = await SupplyRequest.find(filter).sort({ createdAt: -1 })
    .populate("supplier", "name email").populate("product", "name sku")
    .populate("warehouse", "name").populate("reviewedBy", "name");
  res.json({ requests });
}));

router.post("/", allowRoles("supplier", "admin"), asyncHandler(async (req, res) => {
  const { product, warehouse, quantity } = req.body;
  const amount = Number(quantity);
  if (!mongoose.isValidObjectId(product) || !mongoose.isValidObjectId(warehouse) || !Number.isInteger(amount) || amount < 1) {
    return res.status(400).json({ message: "Product, warehouse, and positive whole-number quantity are required" });
  }
  if (!(await Warehouse.exists({ _id: warehouse }))) return res.status(404).json({ message: "Warehouse not found" });
  const productRecord = await Product.findById(product);
  if (!productRecord) return res.status(404).json({ message: "Product not found" });
  if (req.user.role === "supplier" && productRecord.supplier &&
      productRecord.supplier.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "You can only request supply for your associated products" });
  }
  const request = await SupplyRequest.create({ supplier: req.user._id, product, warehouse, quantity: amount });
  await request.populate(["supplier", "product", "warehouse"]);
  res.status(201).json({ request });
}));

const reviewRequest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Approved", "Rejected"].includes(status)) return res.status(400).json({ message: "Status must be Approved or Rejected" });
  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      request = await SupplyRequest.findById(req.params.id).session(session);
      if (!request) {
        const error = new Error("Supply request not found");
        error.status = 404;
        throw error;
      }
      if (request.status !== "Pending") {
        const error = new Error("Only pending requests can be reviewed");
        error.status = 409;
        throw error;
      }
      if (req.user.role === "warehouseManager" && !req.user.assignedWarehouses.some(id => id.toString() === request.warehouse.toString())) {
        const error = new Error("Warehouse is not assigned to your account");
        error.status = 403;
        throw error;
      }
      if (status === "Approved") {
        await Stock.findOneAndUpdate(
          { product: request.product, warehouse: request.warehouse },
          { $inc: { quantity: request.quantity }, $setOnInsert: { product: request.product, warehouse: request.warehouse } },
          { upsert: true, returnDocument: "after", session }
        );
        await StockTransaction.create([{
          product: request.product, warehouse: request.warehouse, transactionType: "stock-in",
          quantity: request.quantity, note: "Approved supply request", performedBy: req.user._id
        }], { session });
      }
      request.status = status;
      request.reviewedBy = req.user._id;
      await request.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await request.populate(["supplier", "product", "warehouse", "reviewedBy"]);
  res.json({ request });
});

router.put("/:id/status", allowRoles("admin", "warehouseManager"), reviewRequest);
router.patch("/:id/status", allowRoles("admin", "warehouseManager"), reviewRequest);

export default router;
