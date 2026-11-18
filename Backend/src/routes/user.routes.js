import { Router } from "express";
import User from "../models/User.js";
import Warehouse from "../models/Warehouse.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";
import { deleteImage, imagePayload } from "../services/imagekit.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);
const roles = ["admin", "warehouseManager", "supplier", "salesRepresentative"];

router.put("/me", asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (req.body.name !== undefined) {
    if (!String(req.body.name).trim()) return res.status(400).json({ message: "Name cannot be empty" });
    user.name = String(req.body.name).trim();
  }
  if (req.body.phone !== undefined) user.phone = String(req.body.phone).trim();
  const image = await imagePayload(req.body);
  const oldFileId = user.imageFileId;
  if (image.imageFileId) {
    user.image = image.imageUrl;
    user.imageFileId = image.imageFileId;
  }
  await user.save();
  if (oldFileId && oldFileId !== user.imageFileId) await deleteImage(oldFileId);
  res.json({ user });
}));

router.use(allowRoles("admin"));

router.get("/", asyncHandler(async (_req, res) => {
  const users = await User.find().select("-password").populate("assignedWarehouses", "name");
  res.json({ users });
}));

router.post("/", asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, assignedWarehouses } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" ||
      typeof password !== "string" || password.length < 8 || !roles.includes(role)) {
    return res.status(400).json({ message: "Provide name, email, password (8+ characters), and a valid role" });
  }
  const warehouses = assignedWarehouses || [];
  if (!Array.isArray(warehouses)) return res.status(400).json({ message: "Assigned warehouses must be a list" });
  if (role !== "warehouseManager" && warehouses.length) return res.status(400).json({ message: "Only warehouse managers can be assigned warehouses" });
  if (warehouses.length && await Warehouse.countDocuments({ _id: { $in: warehouses } }) !== warehouses.length) {
    return res.status(400).json({ message: "One or more assigned warehouses do not exist" });
  }
  const user = await User.create({ name, email, password, phone, role, assignedWarehouses: warehouses });
  if (role === "warehouseManager" && warehouses.length) {
    await User.updateMany({ _id: { $ne: user._id }, role: "warehouseManager", assignedWarehouses: { $in: warehouses } }, { $pull: { assignedWarehouses: { $in: warehouses } } });
    await Warehouse.updateMany({ _id: { $in: warehouses } }, { $set: { manager: user._id } });
  }
  res.status(201).json({ user });
}));

async function updateUser(req, res) {
  const user = await User.findById(req.params.id).select("+password");
  if (!user) return res.status(404).json({ message: "User not found" });
  const previousRole = user.role;
  const { name, email, password, phone, role, assignedWarehouses } = req.body;
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (password !== undefined) {
    if (password.length < 8) return res.status(400).json({ message: "Password must contain at least 8 characters" });
    user.password = password;
  }
  if (role !== undefined) {
    if (!roles.includes(role)) return res.status(400).json({ message: "Invalid role" });
    if (user.role === "admin" && role !== "admin" && await User.countDocuments({ role: "admin" }) <= 1) {
      return res.status(409).json({ message: "At least one administrator account must remain" });
    }
    user.role = role;
    if (role !== "warehouseManager" && assignedWarehouses === undefined) user.assignedWarehouses = [];
  }
  if (assignedWarehouses !== undefined) {
    if (!Array.isArray(assignedWarehouses)) return res.status(400).json({ message: "Assigned warehouses must be a list" });
    if (user.role !== "warehouseManager" && assignedWarehouses.length) {
      return res.status(400).json({ message: "Only warehouse managers can be assigned warehouses" });
    }
    if (await Warehouse.countDocuments({ _id: { $in: assignedWarehouses } }) !== assignedWarehouses.length) {
      return res.status(400).json({ message: "One or more assigned warehouses do not exist" });
    }
    user.assignedWarehouses = assignedWarehouses;
  }
  await user.save();
  if (previousRole === "warehouseManager" || user.role === "warehouseManager") {
    await Warehouse.updateMany({ manager: user._id }, { $unset: { manager: 1 } });
    if (user.role === "warehouseManager" && user.assignedWarehouses.length) {
      await User.updateMany({ _id: { $ne: user._id }, role: "warehouseManager", assignedWarehouses: { $in: user.assignedWarehouses } }, {
        $pull: { assignedWarehouses: { $in: user.assignedWarehouses } }
      });
      await Warehouse.updateMany({ _id: { $in: user.assignedWarehouses } }, { $set: { manager: user._id } });
    }
  }
  res.json({ user: await User.findById(user._id).populate("assignedWarehouses", "name") });
}
router.put("/:id", asyncHandler(updateUser));
router.patch("/:id", asyncHandler(updateUser));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) return res.status(409).json({ message: "You cannot delete your own account" });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role === "admin" && await User.countDocuments({ role: "admin" }) <= 1) {
    return res.status(409).json({ message: "At least one administrator account must remain" });
  }
  await Warehouse.updateMany({ manager: user._id }, { $unset: { manager: 1 } });
  await deleteImage(user.imageFileId);
  await user.deleteOne();
  res.json({ message: "User deleted" });
}));

export default router;
