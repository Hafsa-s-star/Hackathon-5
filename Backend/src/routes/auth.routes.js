import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { cookieOptions, signToken } from "../utils/token.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.post("/register", asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  const role = req.body.role || "salesRepresentative";
  const publicRoles = ["salesRepresentative", "supplier", "warehouseManager"];
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" ||
      typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "Name, email, and a password of at least 8 characters are required" });
  }
  if (!publicRoles.includes(role)) {
    return res.status(400).json({ message: "Choose Sales Representative, Supplier, or Warehouse Manager. Admin accounts must be created by an administrator." });
  }
  const user = await User.create({ name, email, password, phone, role });
  const token = signToken(user);
  res.cookie("token", token, cookieOptions);
  res.status(201).json({ user });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  res.cookie("token", signToken(user), cookieOptions);
  res.json({ user: await User.findById(user._id).select("-password") });
}));

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
router.post("/logout", (_req, res) => {
  res.clearCookie("token", { ...cookieOptions, maxAge: undefined });
  res.json({ message: "Logged out" });
});

router.get("/status", (_req, res) => res.json({ status: "ok" }));

export default router;
