import "dotenv/config";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Warehouse from "../src/models/Warehouse.js";
import Stock from "../src/models/Stock.js";
import StockTransaction from "../src/models/StockTransaction.js";

await connectDB();
const admin = await User.findOne({ role: "admin" });
if (!admin) throw new Error("Create an administrator first with npm run create-admin");

let warehouse = await Warehouse.findOne({ name: "Stockwise Demo Warehouse" });
if (!warehouse) {
  warehouse = await Warehouse.create({
    name: "Stockwise Demo Warehouse",
    location: "Main distribution center",
    capacity: 10000
  });
}

const catalog = [
  { name: "Laptop", sku: "DEMO-LAP-001", category: "Computers", price: 80000, lowStockLimit: 5, quantity: 20 },
  { name: "Wireless Mouse", sku: "DEMO-MOU-001", category: "Accessories", price: 1500, lowStockLimit: 10, quantity: 35 },
  { name: "Mechanical Keyboard", sku: "DEMO-KEY-001", category: "Accessories", price: 4500, lowStockLimit: 8, quantity: 24 },
  { name: "USB-C Dock", sku: "DEMO-DOC-001", category: "Accessories", price: 9500, lowStockLimit: 5, quantity: 12 }
];

let createdProducts = 0;
let createdStockRecords = 0;
for (const item of catalog) {
  let product = await Product.findOne({ sku: item.sku });
  if (!product) {
    product = await Product.create({
      name: item.name,
      sku: item.sku,
      category: item.category,
      price: item.price,
      lowStockLimit: item.lowStockLimit,
      description: `${item.name} from the Stockwise starter catalog.`,
      createdBy: admin._id
    });
    createdProducts += 1;
  }
  const existingStock = await Stock.findOne({ product: product._id, warehouse: warehouse._id });
  if (!existingStock) {
    await Stock.create({ product: product._id, warehouse: warehouse._id, quantity: item.quantity });
    await StockTransaction.create({
      product: product._id,
      warehouse: warehouse._id,
      transactionType: "stock-in",
      quantity: item.quantity,
      note: "Initial Stockwise demo inventory",
      performedBy: admin._id
    });
    createdStockRecords += 1;
  }
}

console.log(`Demo catalog ready: ${createdProducts} products and ${createdStockRecords} initial stock records added.`);
await (await import("mongoose")).default.disconnect();
