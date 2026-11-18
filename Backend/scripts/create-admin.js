import "dotenv/config";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 8 characters) in the environment");
}

await connectDB();
const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase().trim() });
if (existing) throw new Error("An account already exists for ADMIN_EMAIL");
await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: "admin" });
console.log(`Administrator created for ${ADMIN_EMAIL}`);
process.exit(0);
