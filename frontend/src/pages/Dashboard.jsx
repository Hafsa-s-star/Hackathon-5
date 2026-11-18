import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, ClipboardList, Package, Plus, Truck, Users, Warehouse } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import api from "../services/api";
import useAuth from "../context/useAuth";
import { showError } from "../services/alerts";

const money = amount => Number(amount || 0).toLocaleString("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const emptyStats = Object.freeze({});

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/dashboard").then(response => setData(response.data)).catch(error => showError(error.response?.data?.message || "Dashboard data could not be loaded"));
  }, []);

  const stats = data?.stats || emptyStats;
  const isSupplier = user?.role === "supplier";
  const canViewInventoryAlerts = ["admin", "warehouseManager", "salesRepresentative"].includes(user?.role);
  const canViewAuditTrail = ["admin", "warehouseManager"].includes(user?.role);
  const cards = useMemo(() => {
    const all = {
      users: { label: "Total users", value: stats.users ?? "—", icon: Users, delta: "Workspace members" },
      products: { label: "Total products", value: stats.products ?? "—", icon: Package, delta: "In your catalog" },
      warehouses: { label: "Warehouses", value: stats.warehouses ?? "—", icon: Warehouse, delta: "Assigned locations" },
      suppliers: { label: "Suppliers", value: stats.suppliers ?? "—", icon: Truck, delta: "Supply partners" },
      orders: { label: "Total orders", value: stats.orders ?? "—", icon: ClipboardList, delta: `${stats.activeOrders || 0} currently active` },
      stock: { label: "Inventory units", value: (stats.totalUnits ?? 0).toLocaleString(), icon: Boxes, delta: "Across your warehouses" },
      low: { label: "Low-stock items", value: stats.lowStock ?? 0, icon: Boxes, delta: "At or below reorder level", trend: stats.lowStock ? "down" : "up" },
      revenue: { label: "Monthly sales", value: money(stats.monthlyRevenue), icon: ArrowUpRight, delta: "Completed this month" },
      requests: { label: "Open requests", value: stats.pendingRequests ?? 0, icon: Truck, delta: "Awaiting a decision" }
    };
    if (user?.role === "admin") return [all.users, all.products, all.warehouses, all.suppliers, all.orders, all.stock, all.low];
    if (user?.role === "warehouseManager") return [all.warehouses, all.products, all.stock, all.low, all.orders];
    if (user?.role === "supplier") return [all.products, all.requests];
    return [all.products, all.orders, all.stock, all.revenue];
  }, [stats, user?.role]);

  const quickPath = user?.role === "admin" ? "/products" : user?.role === "warehouseManager" ? "/stock" : user?.role === "supplier" ? "/supplies" : "/orders";
  const quickLabel = user?.role === "admin" ? "Add a product" : user?.role === "warehouseManager" ? "Record stock movement" : user?.role === "supplier" ? "Create supply request" : "Create sales order";

  return (
    <div className="page">
      <div className="topline"><span>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</span><span className="topline-divider" /><span>Workspace overview</span></div>
      <header className="page-heading dashboard-heading">
        <div><p className="eyebrow">{user?.role === "admin" ? "ADMIN DASHBOARD" : user?.role === "warehouseManager" ? "WAREHOUSE OPERATIONS" : user?.role === "supplier" ? "SUPPLIER PORTAL" : "SALES WORKSPACE"}</p><h1>Welcome, {user?.name?.split(" ")[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">A clear view of your operations, updated as work happens.</p></div>
        <Link className="button button-primary" to={quickPath}><Plus size={17} /> {quickLabel}</Link>
      </header>

      <section className="stats-grid">
        {cards.map(({ label, value, icon: Icon, delta, trend }) => (
          <article className="stat-card" key={label}>
            <div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={18} /></div></div>
            <strong className="stat-value">{value}</strong>
            <div className={`stat-delta ${trend === "down" ? "negative" : ""}`}>{trend === "down" ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{delta}</div>
          </article>
        ))}
      </section>

      <section className="panel action-panel">
        <div className="panel-heading"><div><p className="eyebrow">ROLE-SPECIFIC ALERTS</p><h2>Needs attention</h2></div></div>
        <div className="action-list">
          {isSupplier ? (
            <Link className="action-item" to="/supplies"><span className="status-tag tag-amber">{stats.pendingRequests || 0}</span><span><strong>Supply requests awaiting review</strong><small>Track your requests and their latest status.</small></span><ArrowRight size={16} /></Link>
          ) : (
            <>
              {canViewInventoryAlerts && <Link className="action-item" to="/stock"><span className={`status-tag ${stats.lowStock ? "tag-amber" : "tag-green"}`}>{stats.lowStock || 0}</span><span><strong>{stats.lowStock ? "Low-stock items need attention" : "Inventory levels are healthy"}</strong><small>Only inventory visible to your role is included.</small></span><ArrowRight size={16} /></Link>}
              {["admin", "warehouseManager"].includes(user?.role) && <Link className="action-item" to="/supplies"><span className={`status-tag ${stats.pendingRequests ? "tag-amber" : "tag-green"}`}>{stats.pendingRequests || 0}</span><span><strong>Supply requests awaiting review</strong><small>Review requests for warehouses you can manage.</small></span><ArrowRight size={16} /></Link>}
              {["admin", "warehouseManager", "salesRepresentative"].includes(user?.role) && <Link className="action-item" to="/orders"><span className={`status-tag ${stats.activeOrders ? "tag-blue" : "tag-green"}`}>{stats.activeOrders || 0}</span><span><strong>Orders in progress</strong><small>Pending and processing orders in your workspace.</small></span><ArrowRight size={16} /></Link>}
            </>
          )}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">SALES PERFORMANCE</p><h2>Monthly sales</h2></div><span className="chart-caption">COMPLETED ORDERS · PKR</span></div>
          {data?.monthlySales?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.monthlySales} margin={{ top: 16, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#edf0ee" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#919b98", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#919b98", fontSize: 10 }} />
            <Tooltip formatter={value => money(value)} contentStyle={{ border: "1px solid #e8ecea", borderRadius: 10, fontSize: 12 }} />
            <Bar dataKey="sales" name="Sales" fill="#3978ee" radius={[4, 4, 0, 0]} maxBarSize={35} />
          </BarChart></ResponsiveContainer></div> : <div className="empty-chart"><div className="empty-icon"><ClipboardList size={21} /></div><strong>Sales will show here</strong><span>Complete orders to see monthly sales performance.</span></div>}
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">INVENTORY FLOW</p><h2>Stock movements</h2></div><span className="chart-caption">UNITS</span></div>
          {data?.stockMovements?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.stockMovements} margin={{ top: 16, right: 12, bottom: 0, left: -20 }}>
            <defs><linearGradient id="movementFillIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3978ee" stopOpacity={0.17} /><stop offset="100%" stopColor="#3978ee" stopOpacity={0} /></linearGradient><linearGradient id="movementFillOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b78df" stopOpacity={0.12} /><stop offset="100%" stopColor="#8b78df" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#edf0ee" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#919b98", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#919b98", fontSize: 10 }} />
            <Tooltip contentStyle={{ border: "1px solid #e8ecea", borderRadius: 10, fontSize: 12 }} />
            <Area type="monotone" dataKey="stockIn" name="Stock in" stroke="#3978ee" strokeWidth={2} fill="url(#movementFillIn)" />
            <Area type="monotone" dataKey="stockOut" name="Stock out" stroke="#8b78df" strokeWidth={2} fill="url(#movementFillOut)" />
          </AreaChart></ResponsiveContainer></div> : <div className="empty-chart"><div className="empty-icon"><Boxes size={21} /></div><strong>No movements yet</strong><span>Recorded stock transactions appear here.</span></div>}
          <div className="chart-legend"><span><i className="legend-blue" /> Stock in</span><span><i className="legend-purple" /> Stock out</span></div>
        </section>
      </div>

      <div className="dashboard-grid lower-dashboard">
        {canViewInventoryAlerts && <section className="panel activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">REORDER WATCH</p><h2>Low-stock alerts</h2></div><Link className="text-link" to="/stock">View inventory <ArrowRight size={14} /></Link></div>
          {data?.lowStockProducts?.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>WAREHOUSE</th><th>AVAILABLE</th><th>REORDER AT</th></tr></thead><tbody>
            {data.lowStockProducts.map(item => <tr key={item._id}><td><strong>{item.product?.name || "Product"}</strong><small className="table-sub">{item.product?.sku}</small></td><td>{item.warehouse?.name}</td><td><span className="status-tag tag-amber">{item.quantity}</span></td><td>{item.product?.lowStockLimit}</td></tr>)}
          </tbody></table></div> : <div className="table-empty"><div className="empty-icon"><Boxes size={20} /></div><p>No low-stock products. Your shelves look good.</p></div>}
        </section>}
        {!isSupplier ? <section className="panel activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent orders</h2></div><Link className="text-link" to="/orders">All orders <ArrowRight size={14} /></Link></div>
          {data?.recentOrders?.length ? <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>
            {data.recentOrders.map(order => <tr key={order._id}><td><span className="order-number">{order.orderNumber}</span></td><td><strong>{order.customerName}</strong></td><td>{money(order.totalAmount)}</td><td><span className={`status-tag ${order.status === "Completed" ? "tag-green" : order.status === "Cancelled" ? "tag-red" : "tag-blue"}`}>{order.status}</span></td></tr>)}
          </tbody></table></div> : <div className="table-empty"><p>No orders to show yet.</p><Link to="/orders">Create an order <ArrowRight size={14} /></Link></div>}
        </section> : <section className="panel activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent supply requests</h2></div><Link className="text-link" to="/supplies">Request history <ArrowRight size={14} /></Link></div>
          {data?.recentRequests?.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>WAREHOUSE</th><th>QUANTITY</th><th>STATUS</th></tr></thead><tbody>
            {data.recentRequests.map(request => <tr key={request._id}><td><strong>{request.product?.name || "Product"}</strong><small className="table-sub">{request.product?.sku}</small></td><td>{request.warehouse?.name || "—"}</td><td>{request.quantity}</td><td><span className={`status-tag ${request.status === "Approved" ? "tag-green" : request.status === "Rejected" ? "tag-red" : "tag-amber"}`}>{request.status}</span></td></tr>)}
          </tbody></table></div> : <div className="table-empty"><p>No supply requests yet.</p><Link to="/supplies">Create a request <ArrowRight size={14} /></Link></div>}
        </section>}
      </div>

      {canViewAuditTrail && <section className="panel activity-panel">
        <div className="panel-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent stock transactions</h2></div><Link className="text-link" to="/transactions">View transaction history <ArrowRight size={14} /></Link></div>
        {data?.recentTransactions?.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>WAREHOUSE</th><th>QUANTITY</th><th>BY</th><th>DATE</th></tr></thead><tbody>
          {data.recentTransactions.map(item => <tr key={item._id}><td><strong>{item.product?.name || "Product"}</strong><small className="table-sub">{item.product?.sku}</small></td><td><span className={`status-tag ${item.transactionType === "stock-in" ? "tag-green" : "tag-blue"}`}>{item.transactionType === "stock-in" ? "Stock in" : "Stock out"}</span></td><td>{item.warehouse?.name}</td><td className="quantity-cell">{item.transactionType === "stock-in" ? "+" : "−"}{item.quantity}</td><td>{item.performedBy?.name}</td><td>{new Date(item.date).toLocaleDateString()}</td></tr>)}
        </tbody></table></div> : <div className="table-empty"><p>No stock transactions yet.</p><Link to="/stock">Record the first movement <ArrowRight size={14} /></Link></div>}
      </section>}
    </div>
  );
}
