import { Router } from "express";
import Warehouse from "../models/Warehouse.js";
import User from "../models/User.js";
import Stock from "../models/Stock.js";
import Order from "../models/Order.js";
import SupplyRequest from "../models/SupplyRequest.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const filter = req.user.role === "warehouseManager" ? { _id: { $in: req.user.assignedWarehouses } } : {};
  const warehouses = await Warehouse.find(filter).populate("manager", "name email");
  res.json({ warehouses });
}));

router.post("/", allowRoles("admin"), asyncHandler(async (req, res) => {
  const { name, location, capacity, manager } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof location !== "string" || !location.trim() ||
      capacity === undefined || !Number.isFinite(Number(capacity)) || Number(capacity) < 0) {
    return res.status(400).json({ message: "Name, location, and a non-negative capacity are required" });
  }
  if (manager && !(await User.exists({ _id: manager, role: "warehouseManager" }))) {
    return res.status(400).json({ message: "Select a valid warehouse manager" });
  }
  const warehouse = await Warehouse.create({ name, location, capacity, manager: manager || undefined });
  if (manager) await User.findByIdAndUpdate(manager, { $addToSet: { assignedWarehouses: warehouse._id } });
  await warehouse.populate("manager", "name email");
  res.status(201).json({ warehouse });
}));

async function updateWarehouse(req, res) {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
  const oldManager = warehouse.manager?.toString();
  for (const field of ["name", "location", "capacity"]) {
    if (req.body[field] !== undefined) warehouse[field] = req.body[field];
  }
  if (req.body.manager !== undefined) {
    const managerId = req.body.manager || null;
    if (managerId && !(await User.exists({ _id: managerId, role: "warehouseManager" }))) {
      return res.status(400).json({ message: "Select a valid warehouse manager" });
    }
    warehouse.manager = managerId;
  }
  await warehouse.save();
  if (oldManager && oldManager !== warehouse.manager?.toString()) {
    await User.findByIdAndUpdate(oldManager, { $pull: { assignedWarehouses: warehouse._id } });
  }
  if (warehouse.manager) {
    await User.updateMany({ _id: { $ne: warehouse.manager }, role: "warehouseManager", assignedWarehouses: warehouse._id }, {
      $pull: { assignedWarehouses: warehouse._id }
    });
    await User.findByIdAndUpdate(warehouse.manager, { $addToSet: { assignedWarehouses: warehouse._id } });
  }
  await warehouse.populate("manager", "name email");
  res.json({ warehouse });
}
router.put("/:id", allowRoles("admin"), asyncHandler(updateWarehouse));
router.patch("/:id", allowRoles("admin"), asyncHandler(updateWarehouse));

router.delete("/:id", allowRoles("admin"), asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
  const references = await Promise.all([
    Stock.exists({ warehouse: warehouse._id }),
    Order.exists({ warehouse: warehouse._id }),
    SupplyRequest.exists({ warehouse: warehouse._id })
  ]);
  if (references.some(Boolean)) return res.status(409).json({ message: "Warehouses referenced by inventory, orders, or supply requests cannot be deleted" });
  if (warehouse.manager) await User.findByIdAndUpdate(warehouse.manager, { $pull: { assignedWarehouses: warehouse._id } });
  await warehouse.deleteOne();
  res.json({ message: "Warehouse deleted" });
}));

export default router;
