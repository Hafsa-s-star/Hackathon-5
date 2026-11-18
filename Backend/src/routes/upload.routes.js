import { Router } from "express";
import { createHmac, randomUUID } from "node:crypto";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/auth", requireAuth, (req, res) => {
  const { IMAGEKIT_PRIVATE_KEY, IMAGEKIT_PUBLIC_KEY } = process.env;
  if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_PUBLIC_KEY) {
    return res.status(503).json({ message: "Image uploads are not configured on this server" });
  }
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60;
  const signature = createHmac("sha1", IMAGEKIT_PRIVATE_KEY).update(token + expire).digest("hex");
  res.json({ token, expire, signature, publicKey: IMAGEKIT_PUBLIC_KEY });
});

export default router;
