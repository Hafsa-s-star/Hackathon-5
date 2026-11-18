import { Navigate } from "react-router-dom";
import useAuth from "../context/useAuth";
import Unauthorized from "../pages/Unauthorized";

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Unauthorized />;
  return children || <Navigate to="/" replace />;
}
