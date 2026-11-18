import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const sourceUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!sourceUri) throw new Error("Set MONGO_URI before running the workflow test");
const database = `stockwise_eval_${Date.now()}`;
const testUri = new URL(sourceUri);
testUri.pathname = `/${database}`;
process.env.MONGO_URI = testUri.toString();
process.env.JWT_SECRET = "isolated-stockwise-workflow-check";
process.env.CLIENT_URL = "http://localhost:5173/";

const { default: connectDB } = await import("../src/config/db.js");
const { default: app } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const { default: Stock } = await import("../src/models/Stock.js");
const { default: StockTransaction } = await import("../src/models/StockTransaction.js");
const { imagePayload } = await import("../src/services/imagekit.js");
const passed = [];
let server;

function verify(condition, message) {
  assert.ok(condition, message);
  passed.push(message);
}

async function request(base, path, method = "GET", body, cookie) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : {},
    cookie: response.headers.get("set-cookie")?.split(";")[0]
  };
}

try {
  const originalFetch = globalThis.fetch;
  const originalImageKitEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  const originalImageKitKey = process.env.IMAGEKIT_PRIVATE_KEY;
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/stockwise-eval";
  process.env.IMAGEKIT_PRIVATE_KEY = "workflow-test-key";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ fileId: "verified-image-id", url: "https://ik.imagekit.io/stockwise-eval/profile.png" })
    });
    const verifiedImage = await imagePayload({
      imageUrl: "https://ik.imagekit.io/stockwise-eval/profile.png?updatedAt=123",
      imageFileId: "verified-image-id"
    });
    verify(verifiedImage.imageUrl === "https://ik.imagekit.io/stockwise-eval/profile.png",
      "ImageKit URL variants are replaced with the canonical URL verified by file ID");

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ fileId: "different-image-id", url: "https://ik.imagekit.io/stockwise-eval/profile.png" })
    });
    await assert.rejects(
      imagePayload({ imageUrl: "https://ik.imagekit.io/stockwise-eval/profile.png", imageFileId: "verified-image-id" }),
      error => error.status === 400
    );
    verify(true, "ImageKit rejects a file ID that does not match the verified asset");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalImageKitEndpoint === undefined) delete process.env.IMAGEKIT_URL_ENDPOINT;
    else process.env.IMAGEKIT_URL_ENDPOINT = originalImageKitEndpoint;
    if (originalImageKitKey === undefined) delete process.env.IMAGEKIT_PRIVATE_KEY;
    else process.env.IMAGEKIT_PRIVATE_KEY = originalImageKitKey;
  }

  await connectDB();
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  verify((await request(base, "/health")).status === 200,
    "API health endpoint confirms the MongoDB connection");
  const corsPreflight = await fetch(`${base}/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  verify(corsPreflight.status === 204 &&
    corsPreflight.headers.get("access-control-allow-origin") === "http://localhost:5173" &&
    corsPreflight.headers.get("access-control-allow-credentials") === "true",
  "CORS normalizes configured frontend origins and permits credentialed requests");
  const adminUser = await User.create({
    name: "Eval Admin", email: "admin@stockwise.test", password: "EvalPassword!2026", role: "admin"
  });

  async function login(email) {
    const result = await request(base, "/auth/login", "POST", { email, password: "EvalPassword!2026" });
    assert.equal(result.status, 200, `Could not log in ${email}`);
    return result.cookie;
  }

  const admin = await login(adminUser.email);
  const publicRoleResults = await Promise.all([
    request(base, "/auth/register", "POST", {
      name: "Public Sales", email: "public-sales@stockwise.test", password: "EvalPassword!2026", role: "salesRepresentative"
    }),
    request(base, "/auth/register", "POST", {
      name: "Public Supplier", email: "public-supplier@stockwise.test", password: "EvalPassword!2026", role: "supplier"
    }),
    request(base, "/auth/register", "POST", {
      name: "Public Manager", email: "public-manager@stockwise.test", password: "EvalPassword!2026", role: "warehouseManager"
    })
  ]);
  verify(publicRoleResults.map(result => result.data.user?.role).join(",") === "salesRepresentative,supplier,warehouseManager",
    "Public registration creates each of the three allowed roles");
  verify((await request(base, "/auth/register", "POST", {
    name: "Public Admin", email: "public-admin@stockwise.test", password: "EvalPassword!2026", role: "admin"
  })).status === 400, "Public registration cannot create an administrator");
  const uploadAuth = await request(base, "/upload/auth", "GET", undefined, admin);
  verify(uploadAuth.status === 200 && uploadAuth.data.token && uploadAuth.data.signature && uploadAuth.data.publicKey,
    "Authenticated ImageKit upload parameters are returned");

  const [managerCreated, supplierCreated, salesCreated, otherSalesCreated] = await Promise.all([
    request(base, "/users", "POST", { name: "Eval Manager", email: "manager@stockwise.test", password: "EvalPassword!2026", role: "warehouseManager" }, admin),
    request(base, "/users", "POST", { name: "Eval Supplier", email: "supplier@stockwise.test", password: "EvalPassword!2026", role: "supplier" }, admin),
    request(base, "/users", "POST", { name: "Eval Sales", email: "sales@stockwise.test", password: "EvalPassword!2026", role: "salesRepresentative" }, admin),
    request(base, "/users", "POST", { name: "Other Sales", email: "other-sales@stockwise.test", password: "EvalPassword!2026", role: "salesRepresentative" }, admin)
  ]);
  verify([managerCreated, supplierCreated, salesCreated, otherSalesCreated].every(result => result.status === 201),
    "Admin creates manager, supplier, and sales users");
  const manager = await login("manager@stockwise.test");
  const supplier = await login("supplier@stockwise.test");
  const sales = await login("sales@stockwise.test");
  const otherSales = await login("other-sales@stockwise.test");

  const warehouseCreated = await request(base, "/warehouses", "POST", {
    name: "Eval Main", location: "Hackathon Lab", capacity: 1000, manager: managerCreated.data.user._id
  }, admin);
  const restrictedWarehouse = await request(base, "/warehouses", "POST", {
    name: "Eval Restricted", location: "Elsewhere", capacity: 500
  }, admin);
  verify(warehouseCreated.status === 201 && restrictedWarehouse.status === 201, "Admin creates and assigns warehouse locations");
  const warehouse = warehouseCreated.data.warehouse._id;
  const managerWarehouses = await request(base, "/warehouses", "GET", undefined, manager);
  verify(managerWarehouses.status === 200 && managerWarehouses.data.warehouses.length === 1,
    "Manager sees assigned warehouse only");
  verify((await request(base, "/warehouses", "GET", undefined, supplier)).data.warehouses.length === 2,
    "Supplier can choose from multiple real warehouses");

  const laptopCreated = await request(base, "/products", "POST", {
    name: "Laptop", sku: `EVAL-${Date.now()}`, category: "Computers", price: 80000, lowStockLimit: 5
  }, admin);
  verify(laptopCreated.status === 201, "Admin creates Rs. 80,000 Laptop product");
  const laptop = laptopCreated.data.product._id;
  verify((await request(base, "/products", "GET", undefined, supplier)).data.products.length === 1,
    "Supplier sees starter products available for supply");
  verify((await request(base, "/stock/in", "POST", { product: laptop, warehouse, quantity: 20 }, manager)).status === 201,
    "Manager receives 20 Laptops");
  verify((await request(base, "/stock/out", "POST", { product: laptop, warehouse, quantity: 3 }, manager)).status === 201,
    "Manager removes 3 Laptops");
  verify((await Stock.findOne({ product: laptop, warehouse })).quantity === 17, "Stock balance is 17");
  verify((await request(base, "/stock/out", "POST", { product: laptop, warehouse, quantity: 18 }, manager)).status === 409,
    "Negative stock is rejected");
  verify((await request(base, "/stock/in", "POST", {
    product: laptop, warehouse: restrictedWarehouse.data.warehouse._id, quantity: 1
  }, manager)).status === 403, "Manager cannot modify unassigned warehouse");
  verify((await request(base, "/users", "GET", undefined, manager)).status === 403,
    "Manager cannot access administrator-only user management");

  const orderCreated = await request(base, "/orders", "POST", {
    customerName: "Eval Customer", warehouse,
    products: [{ product: laptop, quantity: 1 }, { product: laptop, quantity: 1 }]
  }, sales);
  verify(orderCreated.status === 201 && orderCreated.data.order.totalAmount === 160000 &&
    orderCreated.data.order.status === "Pending", "Two Laptop order calculates Rs. 160,000 and starts Pending");
  verify((await Stock.findOne({ product: laptop, warehouse })).quantity === 17, "Pending order does not deduct stock");
  verify((await request(base, "/orders", "POST", {
    customerName: "Oversell", warehouse, products: [{ product: laptop, quantity: 18 }]
  }, sales)).status === 409, "Order above available quantity is rejected");
  const orderId = orderCreated.data.order._id;
  verify((await request(base, `/orders/${orderId}/status`, "PUT", { status: "Processing" }, admin)).status === 200,
    "Admin processes the order");
  await request(base, `/orders/${orderId}/status`, "PUT", { status: "Processing" }, admin);
  verify((await Stock.findOne({ product: laptop, warehouse })).quantity === 15, "Order stock is deducted exactly once");
  verify(await StockTransaction.countDocuments({ product: laptop, warehouse, transactionType: "stock-out" }) === 2,
    "Manual removal and order fulfillment create separate stock-out transactions");
  verify((await request(base, `/orders/${orderId}/status`, "PUT", { status: "Completed" }, admin)).status === 200,
    "Processing order can be completed");
  verify((await request(base, `/orders/${orderId}/status`, "PUT", { status: "Processing" }, admin)).status === 409,
    "Completed order cannot be processed again");

  const pendingOrder = await request(base, "/orders", "POST", {
    customerName: "Cancel Test", warehouse, products: [{ product: laptop, quantity: 1 }]
  }, sales);
  verify((await request(base, `/orders/${pendingOrder.data.order._id}/cancel`, "PUT", undefined, otherSales)).status === 403,
    "Sales representative cannot cancel another user's order");
  verify((await request(base, `/orders/${pendingOrder.data.order._id}/cancel`, "PUT", undefined, sales)).status === 200,
    "Sales representative can cancel own pending order");
  verify((await request(base, "/orders", "GET", undefined, otherSales)).data.orders.length === 0,
    "Sales representatives see only their own orders");

  const lowProduct = await request(base, "/products", "POST", {
    name: "Mouse", sku: `EVAL-M-${Date.now()}`, category: "Accessories", price: 1000, lowStockLimit: 5
  }, admin);
  verify(lowProduct.status === 201, "Admin creates a second product for multi-line request testing");
  const requestCreated = await request(base, "/supply-requests", "POST", {
    product: laptop, warehouse, quantity: 10
  }, supplier);
  verify(requestCreated.status === 201 && requestCreated.data.request.status === "Pending",
    "Supplier creates a pending supply request");
  verify((await request(base, "/supply-requests", "GET", undefined, supplier)).data.requests.length === 1,
    "Supplier sees own request history");
  const supplierDashboard = await request(base, "/dashboard", "GET", undefined, supplier);
  const managerDashboard = await request(base, "/dashboard", "GET", undefined, manager);
  verify(supplierDashboard.data.stats.pendingRequests === 1 &&
    supplierDashboard.data.recentRequests[0]._id === requestCreated.data.request._id &&
    managerDashboard.data.stats.pendingRequests === 1,
  "Supplier and assigned manager dashboards show their relevant pending supply request");
  verify((await request(base, "/orders", "GET", undefined, supplier)).status === 403,
    "Supplier cannot access sales order records");
  verify((await request(base, `/supply-requests/${requestCreated.data.request._id}/status`, "PUT", { status: "Approved" }, admin)).status === 200,
    "Admin can approve a supplier request");
  verify((await Stock.findOne({ product: laptop, warehouse })).quantity === 25,
    "Approval adds supply quantity to inventory");
  const batchRequests = await request(base, "/supply-requests", "POST", {
    warehouse,
    items: [{ product: laptop, quantity: 2 }, { product: lowProduct.data.product._id, quantity: 3 }]
  }, supplier);
  verify(batchRequests.status === 201 && batchRequests.data.requests.length === 2,
    "Supplier can submit multiple product lines as separate supply requests");

  await request(base, "/stock/in", "POST", { product: lowProduct.data.product._id, warehouse, quantity: 4 }, manager);
  verify((await request(base, "/stock/low", "GET", undefined, manager)).data.stock.some(row => row.product.sku.startsWith("EVAL-M-")),
    "Low-stock endpoint reports quantities below the threshold");
  verify((await request(base, "/dashboard", "GET", undefined, manager)).data.stats.lowStock === 1,
    "Manager dashboard counts low stock only in assigned warehouses");
  verify((await request(base, "/dashboard", "GET", undefined, supplier)).data.stats.lowStock === 0,
    "Supplier dashboard does not show unrelated warehouse low-stock alerts");
  const dashboard = await request(base, "/dashboard", "GET", undefined, admin);
  verify(dashboard.status === 200 && dashboard.data.stats.users === 8 && dashboard.data.stats.suppliers === 2 &&
    dashboard.data.monthlySales.length === 6 && dashboard.data.stockMovements.length === 6,
  "Dashboard returns user metrics and both monthly chart series");
  verify((await request(base, "/transactions", "GET", undefined, manager)).status === 200,
    "Manager can view scoped transaction history");

  console.log(`PASS ${passed.length} four-role inventory workflow checks`);
  for (const message of passed) console.log(` - ${message}`);
} catch (error) {
  console.error(`WORKFLOW TEST FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.readyState) {
    try {
      await mongoose.connection.dropDatabase();
    } catch {
      console.error(`Unable to remove the isolated test database ${database}`);
      process.exitCode = 1;
    }
    await mongoose.connection.close();
  }
}
