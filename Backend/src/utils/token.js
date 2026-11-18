import jwt from "jsonwebtoken";

const crossSiteDeployment = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

export function signToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export const cookieOptions = {
  httpOnly: true,
  secure: crossSiteDeployment || process.env.COOKIE_SECURE === "true",
  sameSite: crossSiteDeployment ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};
