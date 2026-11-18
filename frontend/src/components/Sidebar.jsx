import { NavLink } from "react-router-dom";
import { Boxes, ChartNoAxesCombined, ClipboardList, History, LayoutDashboard, LogOut, Package, Truck, UserRound, Users, Warehouse } from "lucide-react";
import useAuth from "../context/useAuth";

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/stock", label: "Inventory", icon: Boxes, roles: ["admin", "warehouseManager", "salesRepresentative"] },
  { to: "/transactions", label: "Transactions", icon: History, roles: ["admin", "warehouseManager"] },
  { to: "/warehouses", label: "Warehouses", icon: Warehouse, roles: ["admin"] },
  { to: "/orders", label: "Orders", icon: ClipboardList, roles: ["admin", "warehouseManager", "salesRepresentative"] },
  { to: "/supplies", label: "Supply requests", icon: Truck, roles: ["admin", "warehouseManager", "supplier"] },
  { to: "/profile", label: "My profile", icon: UserRound },
  { to: "/team", label: "Team", icon: Users, roles: ["admin"] }
];
const labels = { admin: "Administrator", warehouseManager: "Warehouse manager", supplier: "Supplier", salesRepresentative: "Sales representative" };

export default function Sidebar() {
  const { user, logout } = useAuth();
  const initials = user?.name?.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ChartNoAxesCombined size={19} /></div><div><strong>stockwise</strong><span>INVENTORY OS</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-links">
        {links.filter(link => !link.roles || link.roles.includes(user?.role)).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-dot" /><div><strong>All systems operational</strong><span>Your workspace is up to date</span></div></div>
        <div className="profile">
          {user?.image ? <img className="avatar" src={user.image} alt="" /> : <div className="avatar avatar-initials">{initials}</div>}
          <div className="profile-copy"><strong>{user?.name}</strong><span>{labels[user?.role] || user?.role}</span></div>
          <button className="icon-button logout-button" title="Log out" onClick={logout}><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
  );
}
