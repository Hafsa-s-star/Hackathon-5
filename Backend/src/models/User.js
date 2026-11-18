import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { type: String, required: true, minlength: 8, select: false },
  phone: { type: String, trim: true, default: "" },
  role: { type: String, enum: ["admin", "warehouseManager", "supplier", "salesRepresentative"], default: "salesRepresentative" },
  assignedWarehouses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" }],
  image: { type: String, default: "" },
  imageFileId: { type: String, default: "" }
}, { timestamps: true });

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};
userSchema.set("toJSON", { transform: (_doc, ret) => { delete ret.password; delete ret.__v; return ret; } });

export default mongoose.model("User", userSchema);
