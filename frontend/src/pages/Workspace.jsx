import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Check, CirclePlus, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../components/Modal";
import api from "../services/api";
import { uploadImage } from "../services/imagekit";
import useAuth from "../context/useAuth";

const config = {
  products: {
    title: "Products", description: "Manage your catalog, pricing and reorder thresholds.", endpoint: "/products", key: "products", create: "Add product",
    fields: [
      { name: "name", label: "Product name", required: true }, { name: "sku", label: "SKU", required: true },
      { name: "category", label: "Category", required: true }, { name: "price", label: "Unit price (Rs.)", type: "number", required: true },
      { name: "lowStockLimit", label: "Low stock threshold", type: "number", defaultValue: "10" },
      { name: "description", label: "Description", type: "textarea" }, { name: "supplier", label: "Supplier", type: "supplier", adminOnly: true },
      { name: "image", label: "Product image (optional)", type: "file" }
    ]
  },
  stock: {
    title: "Inventory", description: "Track stock levels and log movements across your warehouses.", endpoint: "/stock", key: "stock", create: "Record movement",
    fields: [
      { name: "product", label: "Product", type: "product", required: true }, { name: "warehouse", label: "Warehouse", type: "warehouse", required: true },
      { name: "transactionType", label: "Movement", type: "select", options: [["stock-in", "Stock in"], ["stock-out", "Stock out"]], required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "note", label: "Note", type: "textarea" }
    ]
  },
  warehouses: {
    title: "Warehouses", description: "Keep your storage locations and capacity in view.", endpoint: "/warehouses", key: "warehouses", create: "Add warehouse",
    fields: [
      { name: "name", label: "Warehouse name", required: true }, { name: "location", label: "Location", required: true },
      { name: "capacity", label: "Capacity (units)", type: "number", required: true }, { name: "manager", label: "Warehouse manager", type: "manager" }
    ]
  },
  orders: {
    title: "Orders", description: "Create customer orders and follow every fulfillment.", endpoint: "/orders", key: "orders", create: "Create order",
    fields: [
      { name: "customerName", label: "Customer name", required: true }, { name: "customerPhone", label: "Phone" },
      { name: "warehouse", label: "Fulfillment warehouse", type: "warehouse", required: true }
    ]
  },
  supplies: {
    title: "Supply requests", description: "Request product replenishment and review incoming deliveries.", endpoint: "/supply-requests", key: "requests", create: "New request",
    fields: [
      { name: "product", label: "Product", type: "product", required: true }, { name: "warehouse", label: "Deliver to", type: "warehouse", required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true }
    ]
  },
  team: {
    title: "Team", description: "Manage workspace access and team roles.", endpoint: "/users", key: "users", create: "Invite team member",
    fields: [
      { name: "name", label: "Full name", required: true }, { name: "email", label: "Email", type: "email", required: true },
      { name: "password", label: "Temporary password (8+ characters)", type: "password", createOnly: true },
      { name: "phone", label: "Phone" }, { name: "role", label: "Role", type: "select", required: true, options: [
        ["admin", "Administrator"], ["warehouseManager", "Warehouse manager"], ["supplier", "Supplier"], ["salesRepresentative", "Sales representative"]
      ] },
      { name: "assignedWarehouses", label: "Assigned warehouses", type: "warehouses", when: form => form.role === "warehouseManager" }
    ]
  },
  transactions: {
    title: "Transactions", description: "An auditable record of every inventory movement.", endpoint: "/transactions", key: "transactions", create: null, fields: []
  }
};

const currency = value => Number(value || 0).toLocaleString("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const displayValue = value => value == null || value === "" ? "—" : typeof value === "object" ? value.name || value.email || "—" : value;

export default function Workspace({ section }) {
  const spec = config[section];
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [options, setOptions] = useState({ products: [], warehouses: [], users: [] });
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState({});
  const isAdmin = user?.role === "admin";
  const canCreate = section === "products" || section === "warehouses" || section === "team" ? isAdmin || (section === "products" && user?.role === "warehouseManager")
    : section === "stock" ? ["admin", "warehouseManager"].includes(user?.role)
      : section === "orders" ? ["admin", "warehouseManager", "salesRepresentative"].includes(user?.role)
        : section === "supplies" ? ["admin", "supplier"].includes(user?.role) : false;
  const canReview = section === "supplies" && ["admin", "warehouseManager"].includes(user?.role);
  const canChangeOrder = section === "orders" && ["admin", "warehouseManager"].includes(user?.role);

  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get(spec.endpoint);
      setData(response[spec.key] || []);
      if (section === "stock") setTransactions(response.transactions || []);
    } catch (error) {
      toast.error(error.response?.data?.message || `Could not load ${spec.title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [spec, section]);

  useEffect(() => {
    let active = true;
    api.get(spec.endpoint)
      .then(({ data: response }) => {
        if (active) {
          setData(response[spec.key] || []);
          if (section === "stock") setTransactions(response.transactions || []);
        }
      })
      .catch(error => {
        if (active) toast.error(error.response?.data?.message || `Could not load ${spec.title.toLowerCase()}`);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [spec.endpoint, spec.key, spec.title, section]);
  useEffect(() => {
    const calls = [];
    if (spec.fields.some(field => ["product", "warehouse"].includes(field.type)) ||
        isAdmin && spec.fields.some(field => field.type === "supplier")) {
      calls.push(api.get("/products").then(({ data }) => setOptions(previous => ({ ...previous, products: data.products }))));
    }
    if (spec.fields.some(field => ["warehouse", "warehouses"].includes(field.type))) {
      calls.push(api.get("/warehouses").then(({ data }) => setOptions(previous => ({ ...previous, warehouses: data.warehouses }))));
    }
    if (isAdmin && spec.fields.some(field => ["manager", "supplier", "warehouses"].includes(field.type))) {
      calls.push(api.get("/users").then(({ data }) => setOptions(previous => ({ ...previous, users: data.users }))));
    }
    if (section === "orders") calls.push(api.get("/stock").then(({ data }) => setInventory(data.stock)));
    Promise.all(calls).catch(error => toast.error(error.response?.data?.message || "Form options could not be loaded"));
  }, [spec, section, isAdmin]);

  const categories = useMemo(() => [...new Set(data.map(item => item.category).filter(Boolean))].sort(), [data]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.filter(item => (!query || JSON.stringify(item).toLowerCase().includes(query)) &&
      (!category || item.category === category));
  }, [data, search, category]);

  function openForm(item = null) {
    setEditing(item);
    const values = {};
    for (const field of spec.fields) {
      const oldValue = item?.[field.name];
      values[field.name] = field.type === "warehouses" ? (oldValue || []).map(warehouse => warehouse._id || warehouse)
        : field.type === "manager" || field.type === "supplier" ? (oldValue?._id || oldValue || "")
          : item ? oldValue ?? "" : field.defaultValue || "";
    }
    if (section === "stock") values.transactionType = "stock-in";
    if (section === "team" && !item) values.role = "salesRepresentative";
    if (section === "orders") values.products = [{ product: "", quantity: 1 }];
    setForm(values);
    setModal(true);
  }

  async function submit(event) {
    event.preventDefault();
    try {
      let payload = { ...form };
      delete payload.image;
      if (section === "products" && form.image instanceof File) {
        Object.assign(payload, await uploadImage(form.image));
      }
      if (section === "team" && !form.password) delete payload.password;
      if (section === "orders") {
        payload.products = form.products.map(item => ({ product: item.product, quantity: Number(item.quantity) }));
      }
      if (section === "stock") {
        const path = form.transactionType === "stock-in" ? "in" : "out";
        delete payload.transactionType;
        await api.post(`/stock/${path}`, payload);
      } else if (editing) {
        await api.put(`${spec.endpoint}/${editing._id}`, payload);
      } else {
        await api.post(spec.endpoint, payload);
      }
      toast.success(`${section === "orders" ? "Order" : section === "supplies" ? "Supply request" : editing ? spec.title.slice(0, -1) : spec.title.slice(0, -1)} ${editing ? "updated" : "created"}`);
      setModal(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not save this record");
    }
  }

  async function changeStatus(id, status) {
    try {
      await api.put(`/orders/${id}/status`, { status });
      toast.success(status === "Processing" ? "Order processed and stock deducted" : "Order completed");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Order status could not be updated");
    }
  }

  async function cancelOrder(id) {
    if (!window.confirm("Cancel this order?")) return;
    try {
      await api.put(`/orders/${id}/cancel`);
      toast.success("Order cancelled");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Order could not be cancelled");
    }
  }

  async function reviewRequest(id, status) {
    try {
      await api.put(`/supply-requests/${id}/status`, { status });
      toast.success(`Supply request ${status.toLowerCase()}`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Request could not be updated");
    }
  }

  async function remove(id) {
    const endpoint = section === "products" ? "/products" : section === "warehouses" ? "/warehouses" : "/users";
    if (!window.confirm(`Delete this ${section === "team" ? "team member" : section.slice(0, -1)}? This cannot be undone.`)) return;
    try {
      await api.delete(`${endpoint}/${id}`);
      toast.success("Record deleted");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Record could not be deleted");
    }
  }

  const columns = section === "products" ? ["PRODUCT", "SKU", "CATEGORY", "PRICE", "AVAILABLE", "LOW STOCK AT"] :
    section === "warehouses" ? ["WAREHOUSE", "LOCATION", "CAPACITY", "MANAGER"] :
      section === "stock" ? ["PRODUCT", "SKU", "WAREHOUSE", "AVAILABLE", "REORDER LEVEL", "STATUS"] :
        section === "orders" ? ["ORDER", "CUSTOMER", "WAREHOUSE", "TOTAL", "STATUS", "DATE"] :
          section === "supplies" ? ["PRODUCT", "SUPPLIER", "WAREHOUSE", "QUANTITY", "STATUS", "REQUESTED"] :
            section === "transactions" ? ["PRODUCT", "TYPE", "WAREHOUSE", "QUANTITY", "NOTE", "PERFORMED BY", "DATE"] :
              ["TEAM MEMBER", "EMAIL", "ROLE", "PHONE", "JOINED"];

  const orderTotal = section === "orders" ? (form.products || []).reduce((total, line) => {
    const product = options.products.find(item => item._id === line.product);
    return total + Number(product?.price || 0) * Number(line.quantity || 0);
  }, 0) : 0;

  return (
    <div className="page">
      <div className="topline"><span>STOCKWISE</span><span className="topline-divider" /><span>Workspace</span><span className="topline-divider" /><span>{spec.title}</span></div>
      <header className="page-heading">
        <div><p className="eyebrow">MANAGE</p><h1>{spec.title}<span className="heading-period">.</span></h1><p className="page-subtitle">{spec.description}</p></div>
        {canCreate && <button className="button button-primary" onClick={() => openForm()}><Plus size={17} /> {spec.create}</button>}
      </header>
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div><p className="eyebrow">YOUR WORKSPACE</p><h2>{section === "stock" ? "Stock levels" : section === "transactions" ? "Movement ledger" : `All ${spec.title.toLowerCase()}`}</h2></div>
          <div className="filter-tools">
            {section === "products" && <select className="filter-select" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select>}
            <label className="search-field"><Search size={16} /><input placeholder={`Search ${spec.title.toLowerCase()}…`} value={search} onChange={event => setSearch(event.target.value)} /></label>
          </div>
        </div>
        {loading ? <div className="table-empty"><span className="spinner" /> Loading {spec.title.toLowerCase()}…</div> :
          visible.length ? <div className="table-scroll"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>
            {visible.map(item => <tr key={item._id}>
              {section === "products" && <>
                <td><div className="product-cell">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="product-thumb"><Package size={16} /></span>}<strong>{item.name}</strong></div></td><td className="sku-cell">{item.sku}</td><td>{item.category}</td><td>{currency(item.price)}</td><td className="quantity-cell">{(item.availableStock || 0).toLocaleString()}</td><td>{item.lowStockLimit} units</td>
              </>}
              {section === "warehouses" && <><td><strong>{item.name}</strong></td><td>{item.location}</td><td>{Number(item.capacity).toLocaleString()} units</td><td>{displayValue(item.manager)}</td></>}
              {section === "stock" && <><td><strong>{item.product?.name || "Deleted product"}</strong></td><td className="sku-cell">{item.product?.sku || "—"}</td><td>{item.warehouse?.name || "—"}</td><td className="quantity-cell">{item.quantity.toLocaleString()}</td><td>{item.product?.lowStockLimit ?? "—"} units</td><td><span className={`status-tag ${item.quantity <= (item.product?.lowStockLimit || 0) ? "tag-amber" : "tag-green"}`}>{item.quantity <= (item.product?.lowStockLimit || 0) ? "Low stock" : "In stock"}</span></td></>}
              {section === "orders" && <><td><span className="order-number">{item.orderNumber}</span></td><td><strong>{item.customerName}</strong><small className="table-sub">{item.products?.length} product{item.products?.length === 1 ? "" : "s"}</small></td><td>{displayValue(item.warehouse)}</td><td>{currency(item.totalAmount)}</td><td><span className={`status-tag ${item.status === "Completed" ? "tag-green" : item.status === "Cancelled" ? "tag-red" : "tag-blue"}`}>{item.status}</span></td><td>{new Date(item.createdAt).toLocaleDateString()}</td></>}
              {section === "supplies" && <><td><strong>{displayValue(item.product)}</strong><small className="table-sub">{item.product?.sku}</small></td><td>{displayValue(item.supplier)}</td><td>{displayValue(item.warehouse)}</td><td className="quantity-cell">{item.quantity.toLocaleString()}</td><td><span className={`status-tag ${item.status === "Approved" ? "tag-green" : item.status === "Rejected" ? "tag-red" : "tag-amber"}`}>{item.status}</span></td><td>{new Date(item.createdAt).toLocaleDateString()}</td></>}
              {section === "transactions" && <><td><strong>{displayValue(item.product)}</strong><small className="table-sub">{item.product?.sku}</small></td><td><span className={`status-tag ${item.transactionType === "stock-in" ? "tag-green" : "tag-blue"}`}>{item.transactionType === "stock-in" ? "Stock in" : "Stock out"}</span></td><td>{displayValue(item.warehouse)}</td><td className="quantity-cell">{item.quantity}</td><td>{item.note || "—"}</td><td>{displayValue(item.performedBy)}</td><td>{new Date(item.date).toLocaleDateString()}</td></>}
              {section === "team" && <><td><div className="team-cell">{item.image ? <img className="avatar" src={item.image} alt="" /> : <span className="avatar avatar-initials">{item.name?.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span>}<strong>{item.name}</strong></div></td><td>{item.email}</td><td><span className="role-pill">{({ admin: "Admin", warehouseManager: "Warehouse manager", supplier: "Supplier", salesRepresentative: "Sales rep" })[item.role]}</span></td><td>{item.phone || "—"}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td></>}
              <td className="row-action-cell">
                {section === "orders" && <>
                  {canChangeOrder && item.status === "Pending" && <button className="row-action-button" onClick={() => changeStatus(item._id, "Processing")}>Process order</button>}
                  {canChangeOrder && item.status === "Processing" && <button className="row-action-button" onClick={() => changeStatus(item._id, "Completed")}>Complete</button>}
                  {(item.status === "Pending" && (user?.role === "salesRepresentative" && item.createdBy?._id === user?._id || canChangeOrder) ||
                    item.status === "Processing" && canChangeOrder) && <button className="icon-button danger-icon" title="Cancel order" onClick={() => cancelOrder(item._id)}><X size={15} /></button>}
                </>}
                {section === "supplies" && canReview && item.status === "Pending" && <div className="review-actions"><button title="Approve request" className="approve-button" onClick={() => reviewRequest(item._id, "Approved")}><Check size={15} /></button><button title="Reject request" className="reject-button" onClick={() => reviewRequest(item._id, "Rejected")}><X size={15} /></button></div>}
                {((section === "products" && (isAdmin || user?.role === "warehouseManager")) || (section === "warehouses" && isAdmin) || (section === "team" && isAdmin)) && <div className="review-actions">
                  <button className="icon-button" title="Edit record" onClick={() => openForm(item)}><Pencil size={14} /></button>
                  {((section === "products" && isAdmin) || (section === "warehouses" && isAdmin) || (section === "team" && isAdmin && item._id !== user?._id)) && <button className="icon-button danger-icon" title="Delete record" onClick={() => remove(item._id)}><Trash2 size={14} /></button>}
                </div>}
              </td>
            </tr>)}
          </tbody></table></div> : <div className="table-empty"><div className="empty-icon"><Package size={20} /></div><p>{search || category ? "No records match your filters." : `No ${spec.title.toLowerCase()} yet.`}</p>{canCreate && !search && <button className="text-link" onClick={() => openForm()}>{spec.create} <CirclePlus size={15} /></button>}</div>}
        <div className="table-footer"><span>Showing <strong>{visible.length}</strong> of <strong>{data.length}</strong> records</span><button className="refresh-button" onClick={() => { setLoading(true); load(); }}><ArrowDownUp size={14} /> Refresh</button></div>
      </section>

      {section === "stock" && <section className="panel activity-panel">
        <div className="panel-heading"><div><p className="eyebrow">MOVEMENT LEDGER</p><h2>Recent transactions</h2></div></div>
        {transactions.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>WAREHOUSE</th><th>QUANTITY</th><th>NOTE</th><th>DATE</th></tr></thead><tbody>
          {transactions.map(item => <tr key={item._id}><td><strong>{item.product?.name || "Deleted product"}</strong><small className="table-sub">{item.product?.sku}</small></td><td><span className={`status-tag ${item.transactionType === "stock-in" ? "tag-green" : "tag-blue"}`}>{item.transactionType === "stock-in" ? "Stock in" : "Stock out"}</span></td><td>{item.warehouse?.name}</td><td className="quantity-cell">{item.quantity}</td><td>{item.note || "—"}</td><td>{new Date(item.date).toLocaleDateString()}</td></tr>)}
        </tbody></table></div> : <div className="table-empty"><p>No movements have been recorded.</p></div>}
      </section>}

      {modal && <Modal title={editing ? `Edit ${spec.title.slice(0, -1).toLowerCase()}` : spec.create} onClose={() => setModal(false)}>
        <form className="modal-form" onSubmit={submit}>
          <div className="form-grid">
            {spec.fields.filter(field => (!field.adminOnly || isAdmin) && (!field.createOnly || !editing) && (!field.when || field.when(form))).map(field => <label key={field.name} className={field.type === "textarea" ? "field-wide" : ""}>{field.label}
              {field.type === "textarea" ? <textarea required={field.required} rows="3" value={form[field.name] || ""} onChange={event => setForm({ ...form, [field.name]: event.target.value })} /> :
                field.type === "warehouses" ?
                  <select multiple value={form.assignedWarehouses || []} onChange={event => setForm({ ...form, assignedWarehouses: Array.from(event.target.selectedOptions, option => option.value) })}>
                    {options.warehouses.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select> :
                ["select", "product", "warehouse", "manager", "supplier"].includes(field.type) ?
                  <select required={field.required} value={form[field.name] || ""} onChange={event => setForm({ ...form, [field.name]: event.target.value })}>
                    {(field.type === "select" ? field.options : field.type === "product" ? options.products.map(item => [item._id, `${item.name} · ${item.sku}`]) : field.type === "warehouse" ? options.warehouses.map(item => [item._id, item.name]) : field.type === "supplier" ? [["", "No supplier"], ...options.users.filter(item => item.role === "supplier").map(item => [item._id, item.name])] : [["", "Unassigned"], ...options.users.filter(item => item.role === "warehouseManager").map(item => [item._id, item.name])]).map(([value, label]) => <option value={value} key={value || "empty"}>{label}</option>)}
                  </select> :
                  <input required={field.required} type={field.type || "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" && ["price"].includes(field.name) ? "0.01" : field.type === "number" ? "1" : undefined} accept={field.type === "file" ? "image/png,image/jpeg,image/webp" : undefined} value={field.type === "file" ? undefined : form[field.name] || ""} onChange={event => setForm({ ...form, [field.name]: field.type === "file" ? event.target.files?.[0] : event.target.value })} />
              }
            </label>)}
          </div>
          {section === "orders" && <>
            <div className="order-lines-heading"><span>PRODUCTS IN THIS ORDER</span><button type="button" className="text-link" onClick={() => setForm({ ...form, products: [...form.products, { product: "", quantity: 1 }] })}><Plus size={14} /> Add product</button></div>
            <div className="order-lines">{(form.products || []).map((line, index) => {
              const product = options.products.find(item => item._id === line.product);
              const stockAtWarehouse = inventory.find(stock => stock.product?._id === line.product && stock.warehouse?._id === form.warehouse)?.quantity;
              return <div className="order-line" key={index}>
                <select required value={line.product} onChange={event => setForm({ ...form, products: form.products.map((item, row) => row === index ? { ...item, product: event.target.value } : item) })}>
                  <option value="">Select product</option>{options.products.map(item => <option key={item._id} value={item._id}>{item.name} · {item.sku} · {currency(item.price)}</option>)}
                </select>
                <input required type="number" min="1" step="1" value={line.quantity} onChange={event => setForm({ ...form, products: form.products.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item) })} />
                <strong>{currency(Number(product?.price || 0) * Number(line.quantity || 0))}</strong>
                {form.products.length > 1 && <button type="button" className="icon-button danger-icon" onClick={() => setForm({ ...form, products: form.products.filter((_, row) => row !== index) })}><X size={15} /></button>}
                {line.product && <span className="order-available">{stockAtWarehouse ?? product?.availableStock ?? 0} available in selected warehouse</span>}
              </div>;
            })}</div>
            <div className="order-total"><span>Grand total <small>Stock is deducted when the order is processed.</small></span><strong>{currency(orderTotal)}</strong></div>
          </>}
          {section === "products" && editing?.imageUrl && <div className="current-image"><img src={editing.imageUrl} alt="" /><span>Current product image. Choose a file to replace it.</span></div>}
          <div className="modal-actions"><button type="button" className="button button-muted" onClick={() => setModal(false)}>Cancel</button><button className="button button-primary"><Plus size={16} /> {editing ? "Save changes" : "Save record"}</button></div>
        </form>
      </Modal>}
    </div>
  );
}
