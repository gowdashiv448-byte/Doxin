import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth, AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { AppShell } from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LoadsPage from "./pages/LoadsPage";
import DispatchPage from "./pages/DispatchPage";
import TripsPage from "./pages/TripsPage";
import TrackingPage from "./pages/TrackingPage";
import CustomersPage from "./pages/CustomersPage";
import DriversPage from "./pages/DriversPage";
import FleetPage from "./pages/FleetPage";
import NetworkPage from "./pages/NetworkPage";
import FuelPage from "./pages/FuelPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SafetyPage from "./pages/SafetyPage";
import TeamPage from "./pages/TeamPage";
import ImportsPage from "./pages/ImportsPage";
import SettingsPage from "./pages/SettingsPage";
import { Spinner } from "./components/ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-6 w-6" />
          <p className="text-[12px] text-ink-400">Loading workspace…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-1 text-[13px] text-ink-500">That route is not part of the operations console.</p>
      <a href="/" className="btn-secondary mt-4">Back to overview</a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<Protected />}>
                <Route index element={<DashboardPage />} />
                <Route path="/loads" element={<LoadsPage />} />
                <Route path="/dispatch" element={<DispatchPage />} />
                <Route path="/trips" element={<TripsPage />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/drivers" element={<DriversPage />} />
                <Route path="/fleet" element={<FleetPage />} />
                <Route path="/network" element={<NetworkPage />} />
                <Route path="/fuel" element={<FuelPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/safety" element={<SafetyPage />} />
                <Route path="/team" element={<AdminOnly><TeamPage /></AdminOnly>} />
                <Route path="/imports" element={<AdminOnly><ImportsPage /></AdminOnly>} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
