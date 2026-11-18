import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Warehouse from "../src/models/Warehouse.js";
import Stock from "../src/models/Stock.js";
import StockTransaction from "../src/models/StockTransaction.js";
import Order from "../src/models/Order.js";
import SupplyRequest from "../src/models/SupplyRequest.js";

await connectDB();
const admin = await User.findOne({ role: "admin" });
if (!admin) throw new Error("Create an administrator first with npm run create-admin");

const warehouseDefinitions = [
  { name: "Stockwise Demo Warehouse", location: "Main distribution center", capacity: 10000 },
  { name: "Stockwise North Warehouse", location: "North distribution center", capacity: 5000 },
  { name: "Stockwise South Warehouse", location: "South distribution center", capacity: 5000 }
];
const warehouses = [];
for (const definition of warehouseDefinitions) {
  let warehouse = await Warehouse.findOne({ name: definition.name });
  if (!warehouse) warehouse = await Warehouse.create(definition);
  warehouses.push(warehouse);
}

const catalog = [
  { name: "Laptop", sku: "DEMO-LAP-001", category: "Computers", price: 80000, lowStockLimit: 5, quantity: 20 },
  { name: "Wireless Mouse", sku: "DEMO-MOU-001", category: "Accessories", price: 1500, lowStockLimit: 10, quantity: 35 },
  { name: "Mechanical Keyboard", sku: "DEMO-KEY-001", category: "Accessories", price: 4500, lowStockLimit: 8, quantity: 24 },
  { name: "USB-C Dock", sku: "DEMO-DOC-001", category: "Accessories", price: 9500, lowStockLimit: 5, quantity: 12 },
  { name: "Full HD Monitor", sku: "DEMO-MON-001", category: "Displays", price: 22000, lowStockLimit: 5, quantity: 10 },
  { name: "Wireless Headset", sku: "DEMO-HED-001", category: "Accessories", price: 6500, lowStockLimit: 6, quantity: 16 },
  { name: "HD Webcam", sku: "DEMO-WEB-001", category: "Accessories", price: 4200, lowStockLimit: 5, quantity: 14 },
  { name: "Laser Printer", sku: "DEMO-PRN-001", category: "Printers", price: 32000, lowStockLimit: 3, quantity: 6 }
];

let createdProducts = 0;
let createdStockRecords = 0;
const productsBySku = new Map();
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
  productsBySku.set(item.sku, product);
  for (const [index, warehouse] of warehouses.entries()) {
    const existingStock = await Stock.findOne({ product: product._id, warehouse: warehouse._id });
    if (!existingStock) {
      const quantity = index === 0 ? item.quantity : Math.max(1, Math.floor(item.quantity / 2));
      await Stock.create({ product: product._id, warehouse: warehouse._id, quantity });
      await StockTransaction.create({
        product: product._id,
        warehouse: warehouse._id,
        transactionType: "stock-in",
        quantity,
        note: "Initial Stockwise demo inventory",
        performedBy: admin._id
      });
      createdStockRecords += 1;
    }
  }
}

const salesRepresentatives = await User.find({ role: "salesRepresentative" }).sort({ createdAt: 1 });
let createdOrders = 0;
const orderFixtures = [
  {
    key: "001",
    customerName: "Northstar Office Supplies",
    warehouse: warehouses[0],
    lines: [["DEMO-LAP-001", 2], ["DEMO-MOU-001", 4]]
  },
  {
    key: "002",
    customerName: "Apex Learning Center",
    warehouse: warehouses[1],
    lines: [["DEMO-KEY-001", 3], ["DEMO-DOC-001", 1]]
  }
];
for (const [userIndex, salesRepresentative] of salesRepresentatives.entries()) {
  for (const fixture of orderFixtures) {
    const orderNumber = `DEMO-${salesRepresentative._id.toString().slice(-8)}-${fixture.key}`;
    if (await Order.exists({ orderNumber })) continue;
    const products = fixture.lines.map(([sku, quantity]) => {
      const product = productsBySku.get(sku);
      return { product: product._id, quantity, price: product.price };
    });
    await Order.create({
      orderNumber,
      customerName: `${fixture.customerName} ${userIndex + 1}`,
      warehouse: fixture.warehouse._id,
      products,
      totalAmount: products.reduce((sum, item) => sum + item.quantity * item.price, 0),
      createdBy: salesRepresentative._id,
      status: "Pending",
      stockDeducted: false
    });
    createdOrders += 1;
  }
}
if (!salesRepresentatives.length) {
  console.log("No sales representative exists; create one and rerun the seed to add demo orders.");
}

const suppliers = await User.find({ role: "supplier" }).sort({ createdAt: 1 });
let createdSupplyRequests = 0;
const requestFixtures = [
  { sku: "DEMO-LAP-001", warehouse: warehouses[1], quantity: 8 },
  { sku: "DEMO-WEB-001", warehouse: warehouses[2], quantity: 12 }
];
const requestIdBase = BigInt("0x650000000000000000000000");
for (const [supplierIndex, supplier] of suppliers.entries()) {
  for (const [requestIndex, fixture] of requestFixtures.entries()) {
    const idOffset = supplierIndex * requestFixtures.length + requestIndex + 1;
    const requestId = new mongoose.Types.ObjectId(
      (requestIdBase + BigInt(idOffset)).toString(16).padStart(24, "0")
    );
    if (await SupplyRequest.exists({ _id: requestId })) continue;
    await SupplyRequest.create({
      _id: requestId,
      supplier: supplier._id,
      product: productsBySku.get(fixture.sku)._id,
      warehouse: fixture.warehouse._id,
      quantity: fixture.quantity,
      status: "Pending"
    });
    createdSupplyRequests += 1;
  }
}
if (!suppliers.length) {
  console.log("No supplier exists; create one and rerun the seed to add demo supply requests.");
}

console.log(`Demo data ready: ${warehouses.length} warehouses, ${productsBySku.size} products, ${createdStockRecords} stock records, ${createdOrders} orders and ${createdSupplyRequests} supply requests added.`);
await mongoose.disconnect();
