import { Router } from "express";
import Product from "../models/Product.js";
import Warehouse from "../models/Warehouse.js";
import Stock from "../models/Stock.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import StockTransaction from "../models/StockTransaction.js";
import SupplyRequest from "../models/SupplyRequest.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const isSupplier = req.user.role === "supplier";
  const warehouseIds = isAdmin || req.user.role === "salesRepresentative" && req.user.assignedWarehouses.length === 0
    ? (await Warehouse.find().select("_id")).map(warehouse => warehouse._id)
    : req.user.assignedWarehouses;
  const warehouseFilter = { warehouse: { $in: warehouseIds } };
  const orderFilter = isAdmin ? {} : req.user.role === "salesRepresentative"
    ? { createdBy: req.user._id }
    : isSupplier ? { createdBy: req.user._id }
      : warehouseFilter;
  const productFilter = isSupplier
    ? { $or: [{ supplier: req.user._id }, { supplier: { $exists: false } }, { supplier: null }] }
    : {};
  const [products, warehouseCount, stockRows, orders, recentTransactions, recentOrders, recentRequests, lowRows, pendingRequests,
    totalUsers, totalSuppliers, totalOrders, monthlySales, monthlyMovements, stockByCategory] = await Promise.all([
    Product.countDocuments(productFilter),
    Warehouse.countDocuments({ _id: { $in: warehouseIds } }),
    Stock.find(warehouseFilter).populate("product", "name sku category lowStockLimit"),
    Order.find({ ...orderFilter, status: { $ne: "Cancelled" } }).select("totalAmount status createdAt"),
    StockTransaction.find(warehouseFilter).sort({ date: -1 }).limit(7)
      .populate("product", "name sku").populate("warehouse", "name").populate("performedBy", "name"),
    Order.find(orderFilter).sort({ createdAt: -1 }).limit(5)
      .populate("products.product", "name sku").populate("warehouse", "name").populate("createdBy", "name"),
    SupplyRequest.find(isAdmin ? {} : isSupplier
      ? { supplier: req.user._id }
      : { warehouse: { $in: warehouseIds } }).sort({ createdAt: -1 }).limit(5)
      .populate("supplier", "name").populate("product", "name sku").populate("warehouse", "name"),
    Stock.find(warehouseFilter).populate("product", "name sku category lowStockLimit imageUrl").populate("warehouse", "name"),
    SupplyRequest.countDocuments(isAdmin ? { status: "Pending" } : isSupplier
      ? { supplier: req.user._id, status: "Pending" }
      : { ...warehouseFilter, status: "Pending" }),
    User.countDocuments(isAdmin ? {} : { _id: req.user._id }),
    User.countDocuments(isAdmin ? { role: "supplier" } : isSupplier ? { _id: req.user._id, role: "supplier" } : { _id: { $in: [] } }),
    Order.countDocuments(orderFilter),
    Order.aggregate([
      { $match: { ...orderFilter, status: "Completed", createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) } } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, amount: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
    ]),
    StockTransaction.aggregate([
      { $match: { ...warehouseFilter, date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) } } },
      { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" }, transactionType: "$transactionType" }, quantity: { $sum: "$quantity" } } }
    ]),
    Stock.aggregate([
      { $match: warehouseFilter },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.category", quantity: { $sum: "$quantity" } } },
      { $sort: { quantity: -1 } },
      { $limit: 8 }
    ])
  ]);
  const lowStock = lowRows.filter(row => row.product && row.quantity <= row.product.lowStockLimit);
  const visibleProductCount = req.user.role === "warehouseManager"
    ? new Set(stockRows.filter(row => row.product).map(row => row.product._id.toString())).size
    : products;
  const monthLabels = [];
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - offset);
    monthLabels.push({ year: date.getFullYear(), month: date.getMonth() + 1, label: date.toLocaleString("en", { month: "short" }), sales: 0, stockIn: 0, stockOut: 0 });
  }
  for (const row of monthlySales) {
    const month = monthLabels.find(item => item.year === row._id.year && item.month === row._id.month);
    if (month) month.sales = row.amount;
  }
  for (const row of monthlyMovements) {
    const month = monthLabels.find(item => item.year === row._id.year && item.month === row._id.month);
    if (month) month[row._id.transactionType === "stock-in" ? "stockIn" : "stockOut"] = row.quantity;
  }
  res.json({
    stats: {
      users: totalUsers, suppliers: totalSuppliers, products: visibleProductCount, warehouses: warehouseCount,
      orders: totalOrders, activeOrders: orders.filter(order => ["Pending", "Processing"].includes(order.status)).length,
      totalUnits: stockRows.reduce((sum, row) => sum + row.quantity, 0),
      lowStock: lowStock.length, pendingRequests,
      monthlyRevenue: monthLabels[monthLabels.length - 1].sales
    },
    stockByCategory,
    monthlySales: monthLabels,
    stockMovements: monthLabels,
    recentTransactions,
    recentOrders,
    recentRequests,
    lowStockProducts: lowStock.slice(0, 8)
  });
}));

export default router;
