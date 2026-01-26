// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import api, { setAuthToken } from "../api";

const AuthContext = createContext(null);

const isValidJwt = (value) => {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every(Boolean);
};

const getJwtFromResponse = (data) => data?.access_token ?? data?.token ?? null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("access_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const t = localStorage.getItem("access_token");
      if (!t || !isValidJwt(t)) {
        if (t && !isValidJwt(t)) {
          localStorage.removeItem("access_token");
        }
        setUser(null);
        setToken(null);
        setAuthToken(null);
        setLoading(false);
        return;
      }

      setToken(t);
      setAuthToken(t);

      try {
        const res = await api.get("/auth/me");
        setUser(res.data);
      } catch {
        localStorage.removeItem("access_token");
        setAuthToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });

    const jwt = getJwtFromResponse(res.data);
    if (!isValidJwt(jwt)) {
      throw new Error("Login response missing valid access token");
    }

    localStorage.setItem("access_token", jwt); // ✅ store only JWT
    setAuthToken(jwt);                         // ✅ axios stuurt vanaf nu altijd Bearer
    setToken(jwt);
    setUser(res.data.user);

    return res.data;
  };

  const register = async (name, email, password) => {
    const res = await api.post("/auth/register", { name, email, password });

    const jwt = getJwtFromResponse(res.data);
    if (!isValidJwt(jwt)) {
      throw new Error("Register response missing valid access token");
    }

    localStorage.setItem("access_token", jwt);
    setAuthToken(jwt);
    setToken(jwt);
    setUser(res.data.user);

    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  return (
      <AuthContext.Provider
          value={{ user, token, loading, login, register, logout, isAuthenticated: !!token }}
      >
        {children}
      </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
