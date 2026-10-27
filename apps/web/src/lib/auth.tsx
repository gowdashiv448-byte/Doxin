import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser, ThemeColor } from "@doxin/shared";
import { api, tokenStore } from "./api";
import { applyTheme, readStoredTheme } from "./theme";

interface AuthContextValue {
  user: SessionUser | null;
  token: string | null;
  themeColor: ThemeColor;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changeTheme: (theme: ThemeColor) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [user, setUser] = useState<SessionUser | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor>(() => readStoredTheme());
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const applyUser = useCallback((nextUser: SessionUser) => {
    setUser(nextUser);
    const theme = nextUser.themeColor ?? readStoredTheme();
    setThemeColor(theme);
    applyTheme(theme);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: SessionUser }>("/api/auth/login", { email, password });
    tokenStore.set(result.token);
    setToken(result.token);
    applyUser(result.user);
  }, [applyUser]);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("doxin:unauthorized", handler);
    return () => window.removeEventListener("doxin:unauthorized", handler);
  }, [logout]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .get<{ user: SessionUser }>("/api/auth/me")
      .then((result) => {
        if (alive) applyUser(result.user);
      })
      .catch(() => {
        if (alive) logout();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, logout, applyUser]);

  const changeTheme = useCallback(async (nextTheme: ThemeColor) => {
    const previous = themeColor;
    setThemeColor(nextTheme);
    applyTheme(nextTheme);
    try {
      const result = await api.patch<{ user: SessionUser }>("/api/auth/preferences", { themeColor: nextTheme });
      applyUser(result.user);
    } catch (error) {
      setThemeColor(previous);
      applyTheme(previous);
      throw error;
    }
  }, [applyUser, themeColor]);

  const value = useMemo(
    () => ({ user, token, themeColor, loading, login, logout, changeTheme }),
    [user, token, themeColor, loading, login, logout, changeTheme],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function canWrite(
  role: string | undefined,
  _area: "dispatch" | "ops" | "fleet" | "safety" | "finance" | "admin",
) {
  return role === "ADMIN";
}
