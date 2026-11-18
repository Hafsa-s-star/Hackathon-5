import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import ProtectedRoute from "./routes/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import Profile from "./pages/Profile";
import RoleRoute from "./routes/RoleRoute";
import useAuth from "./context/useAuth";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><span className="spinner" /> Loading workspace</div>;
  return <Navigate to={user ? "/" : "/login"} replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="/products" element={<Workspace section="products" />} />
        <Route path="/stock" element={<Workspace section="stock" />} />
        <Route path="/warehouses" element={<RoleRoute roles={["admin"]}><Workspace section="warehouses" /></RoleRoute>} />
        <Route path="/orders" element={<Workspace section="orders" />} />
        <Route path="/supplies" element={<Workspace section="supplies" />} />
        <Route path="/team" element={<RoleRoute roles={["admin"]}><Workspace section="team" /></RoleRoute>} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/transactions" element={<Workspace section="transactions" />} />
      </Route>
    </Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes>;
}
