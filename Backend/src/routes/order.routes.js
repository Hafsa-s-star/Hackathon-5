import { Router } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Stock from "../models/Stock.js";
import StockTransaction from "../models/StockTransaction.js";
import Warehouse from "../models/Warehouse.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

function orderScope(user) {
  if (user.role === "admin") return {};
  if (user.role === "salesRepresentative") return { createdBy: user._id };
  if (user.role === "warehouseManager") return { warehouse: { $in: user.assignedWarehouses } };
  return null;
}

function forbidden(res) {
  return res.status(403).json({ message: "You do not have permission to access these orders" });
}

router.get("/", allowRoles("admin", "warehouseManager", "salesRepresentative"), asyncHandler(async (req, res) => {
  const orders = await Order.find(orderScope(req.user)).sort({ createdAt: -1 })
    .populate("products.product", "name sku imageUrl")
    .populate("warehouse", "name")
    .populate("createdBy", "name");
  res.json({ orders });
}));

router.post("/", allowRoles("admin", "warehouseManager", "salesRepresentative"), asyncHandler(async (req, res) => {
  const { customerName, customerPhone, warehouse, products } = req.body;
  if (typeof customerName !== "string" || !customerName.trim() || !warehouse || !Array.isArray(products) || !products.length) {
    return res.status(400).json({ message: "Customer, warehouse, and at least one product are required" });
  }
  if (req.user.role === "warehouseManager" && !req.user.assignedWarehouses.some(id => id.toString() === warehouse)) {
    return forbidden(res);
  }
  if (!(await Warehouse.exists({ _id: warehouse }))) return res.status(404).json({ message: "Warehouse not found" });

  const quantities = new Map();
  for (const item of products) {
    const quantity = Number(item.quantity);
    if (!item.product || !mongoose.isValidObjectId(item.product) || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Each order line requires a valid product and positive whole-number quantity" });
    }
    quantities.set(item.product, (quantities.get(item.product) || 0) + quantity);
  }

  const lineItems = [];
  for (const [productId, quantity] of quantities) {
    const [product, stock] = await Promise.all([
      Product.findById(productId),
      Stock.findOne({ product: productId, warehouse })
    ]);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (!stock || stock.quantity < quantity) return res.status(409).json({ message: `Insufficient stock for ${product.name}` });
    lineItems.push({ product: product._id, quantity, price: product.price });
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const order = await Order.create({
    orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    customerName: customerName.trim(), customerPhone, products: lineItems, totalAmount, warehouse, createdBy: req.user._id
  });
  await order.populate(["products.product", "warehouse", "createdBy"]);
  res.status(201).json({ order });
}));

router.get("/:id", allowRoles("admin", "warehouseManager", "salesRepresentative"), asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...orderScope(req.user) };
  const order = await Order.findOne(filter).populate("products.product", "name sku imageUrl")
    .populate("warehouse", "name").populate("createdBy", "name");
  if (!order) return res.status(404).json({ message: "Order not found" });
  res.json({ order });
}));

router.put("/:id/status", allowRoles("admin", "warehouseManager"), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Processing", "Completed"].includes(status)) {
    return res.status(400).json({ message: "Orders can be moved to Processing or Completed" });
  }
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) {
        const error = new Error("Order not found");
        error.status = 404;
        throw error;
      }
      if (req.user.role === "warehouseManager" && !req.user.assignedWarehouses.some(id => id.toString() === order.warehouse.toString())) {
        const error = new Error("Warehouse is not assigned to your account");
        error.status = 403;
        throw error;
      }
      if (status === "Processing" && order.status === "Processing" && order.stockDeducted) return;
      if (status === "Processing" && order.status !== "Pending") {
        const error = new Error("Only pending orders can be processed");
        error.status = 409;
        throw error;
      }
      if (status === "Completed" && order.status !== "Processing") {
        const error = new Error("Only processing orders can be completed");
        error.status = 409;
        throw error;
      }
      if (status === "Processing") {
        for (const item of order.products) {
          const stock = await Stock.findOneAndUpdate(
            { product: item.product, warehouse: order.warehouse, quantity: { $gte: item.quantity } },
            { $inc: { quantity: -item.quantity } },
            { returnDocument: "after", session }
          );
          if (!stock) {
            const error = new Error("Insufficient inventory to process this order");
            error.status = 409;
            throw error;
          }
          await StockTransaction.create([{
            product: item.product, warehouse: order.warehouse, transactionType: "stock-out",
            quantity: item.quantity, note: `Order ${order.orderNumber}`, performedBy: req.user._id
          }], { session });
        }
        order.stockDeducted = true;
      }
      order.status = status;
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await order.populate(["products.product", "warehouse", "createdBy"]);
  res.json({ order });
}));

router.put("/:id/cancel", allowRoles("admin", "warehouseManager", "salesRepresentative"), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) {
        const error = new Error("Order not found");
        error.status = 404;
        throw error;
      }
      if (req.user.role === "salesRepresentative" && order.createdBy.toString() !== req.user._id.toString()) {
        const error = new Error("You can only cancel your own orders");
        error.status = 403;
        throw error;
      }
      if (req.user.role === "warehouseManager" && !req.user.assignedWarehouses.some(id => id.toString() === order.warehouse.toString())) {
        const error = new Error("Warehouse is not assigned to your account");
        error.status = 403;
        throw error;
      }
      if (order.status === "Completed" || order.status === "Cancelled") {
        const error = new Error("Completed or already cancelled orders cannot be cancelled");
        error.status = 409;
        throw error;
      }
      if (req.user.role === "salesRepresentative" && order.status !== "Pending") {
        const error = new Error("Sales representatives can only cancel pending orders");
        error.status = 409;
        throw error;
      }
      if (order.stockDeducted) {
        for (const item of order.products) {
          await Stock.findOneAndUpdate(
            { product: item.product, warehouse: order.warehouse },
            { $inc: { quantity: item.quantity }, $setOnInsert: { product: item.product, warehouse: order.warehouse } },
            { upsert: true, returnDocument: "after", session }
          );
          await StockTransaction.create([{
            product: item.product, warehouse: order.warehouse, transactionType: "stock-in",
            quantity: item.quantity, note: `Restock for cancelled order ${order.orderNumber}`, performedBy: req.user._id
          }], { session });
        }
        order.stockDeducted = false;
      }
      order.status = "Cancelled";
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await order.populate(["products.product", "warehouse", "createdBy"]);
  res.json({ order });
}));

export default router;
