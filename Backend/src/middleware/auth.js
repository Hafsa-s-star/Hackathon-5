import jwt from "jsonwebtoken";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Authentication required" });
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  const user = await User.findById(payload.id).select("-password");
  if (!user) return res.status(401).json({ message: "Account no longer exists" });
  req.user = user;
  next();
});

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
}
