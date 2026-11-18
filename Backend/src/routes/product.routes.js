import { Router } from "express";
import Product from "../models/Product.js";
import Stock from "../models/Stock.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { deleteImage, imagePayload } from "../services/imagekit.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const filter = req.user.role === "supplier"
    ? { $or: [{ supplier: req.user._id }, { supplier: { $exists: false } }, { supplier: null }] }
    : {};
  const products = await Product.find(filter).sort({ createdAt: -1 })
    .populate("supplier", "name email image").populate("createdBy", "name");
  const productIds = products.map(product => product._id);
  const stockFilter = { product: { $in: productIds } };
  if (req.user.role !== "admin" && req.user.assignedWarehouses.length) {
    stockFilter.warehouse = { $in: req.user.assignedWarehouses };
  } else if (req.user.role !== "admin" && req.user.role !== "salesRepresentative" && req.user.role !== "supplier") {
    stockFilter.warehouse = { $in: [] };
  }
  const stock = await Stock.find(stockFilter).select("product quantity");
  const totals = new Map();
  for (const row of stock) totals.set(row.product.toString(), (totals.get(row.product.toString()) || 0) + row.quantity);
  res.json({ products: products.map(product => ({ ...product.toJSON(), availableStock: totals.get(product._id.toString()) || 0 })) });
}));

router.post("/", allowRoles("admin", "warehouseManager"), asyncHandler(async (req, res) => {
  const { name, description, sku, category, price, lowStockLimit, supplier } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof sku !== "string" || !sku.trim() ||
      typeof category !== "string" || !category.trim() || price === undefined ||
      !Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ message: "Name, SKU, category, and a non-negative price are required" });
  }
  const image = await imagePayload(req.body);
  if (supplier && req.user.role === "admin" && !(await User.exists({ _id: supplier, role: "supplier" }))) {
    return res.status(400).json({ message: "Select a valid supplier account" });
  }
  const product = await Product.create({
    name, description, sku, category, price: Number(price), lowStockLimit,
    supplier: req.user.role === "admin" ? supplier : undefined,
    ...image, createdBy: req.user._id
  });
  res.status(201).json({ product });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === "supplier") {
    filter.$or = [{ supplier: req.user._id }, { supplier: { $exists: false } }, { supplier: null }];
  }
  const product = await Product.findOne(filter).populate("supplier", "name email image").populate("createdBy", "name");
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ product });
}));

async function updateProduct(req, res) {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  for (const field of ["name", "description", "sku", "category", "price", "lowStockLimit"]) {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  }
  if (req.user.role === "admin" && req.body.supplier !== undefined) {
    if (req.body.supplier && !(await User.exists({ _id: req.body.supplier, role: "supplier" }))) {
      return res.status(400).json({ message: "Select a valid supplier account" });
    }
    product.supplier = req.body.supplier || undefined;
  }
  const image = await imagePayload(req.body);
  const oldFileId = product.imageFileId;
  if (image.imageFileId) {
    product.imageUrl = image.imageUrl;
    product.imageFileId = image.imageFileId;
  }
  await product.save();
  if (oldFileId && oldFileId !== product.imageFileId) await deleteImage(oldFileId);
  return res.json({ product });
}
router.put("/:id", allowRoles("admin", "warehouseManager"), asyncHandler(updateProduct));
router.patch("/:id", allowRoles("admin", "warehouseManager"), asyncHandler(updateProduct));

router.delete("/:id", allowRoles("admin"), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  const referenced = await Promise.all([
    Stock.exists({ product: product._id }),
    Order.exists({ "products.product": product._id })
  ]);
  if (referenced.some(Boolean)) return res.status(409).json({ message: "Products referenced by stock or orders cannot be deleted" });
  await deleteImage(product.imageFileId);
  await product.deleteOne();
  res.json({ message: "Product deleted" });
}));

export default router;
