import { useEffect, useMemo, useState } from "react";
import AuthContext from "./AuthContext";
import api from "../services/api";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(credentials) {
      const { data } = await api.post("/auth/login", credentials);
      setUser(data.user);
      return data.user;
    },
    async register(values) {
      const { data } = await api.post("/auth/register", values);
      setUser(data.user);
      return data.user;
    },
    async logout() {
      await api.post("/auth/logout");
      setUser(null);
    },
    updateUser(updated) { setUser(updated); }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
