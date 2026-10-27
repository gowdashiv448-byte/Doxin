import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, Sparkles, Truck, Waypoints } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@doxin.com");
  const [password, setPassword] = useState("Doxin@2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-paper">
      <div className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-ink-950 p-10 text-white lg:flex xl:p-14">
        <div className="absolute inset-0 opacity-[0.55]" style={{ backgroundImage: "radial-gradient(circle at 20% 15%, rgb(var(--signal-500) / 0.22), transparent 32%), radial-gradient(circle at 85% 80%, rgba(56,189,248,0.10), transparent 35%)" }} />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "56px 56px" }} />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
              <path d="M6 24V8h9c4.5 0 7.5 3 7.5 8s-3 8-7.5 8H6Zm5-4.2h3.7c2.1 0 3.4-1.3 3.4-3.8s-1.3-3.8-3.4-3.8H11v7.6Z" fill="#0E1520" />
              <circle cx="25" cy="24" r="3.4" fill="rgb(var(--signal-500))" />
            </svg>
          </span>
          <span className="text-xl font-semibold tracking-tight">doxin</span>
          <span className="ml-2 rounded border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/50">Operations OS</span>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-signal-400">
            <span className="h-px w-6 bg-signal-500" /> Run the whole desk, not five spreadsheets
          </p>
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] xl:text-[52px]">
            Every load.
            <br />
            Every asset.
            <br />
            <span className="text-white/45">One source of truth.</span>
          </h1>
          <p className="mt-6 max-w-md text-[14px] leading-7 text-white/55">
            Dispatch loads, assign drivers and equipment, track pickups and deliveries, manage maintenance and safety, and see
            the margin on every lane — without leaving the console.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-3">
            {[
              { icon: <Truck className="h-4 w-4" />, value: "85k+", label: "loads" },
              { icon: <Waypoints className="h-4 w-4" />, value: "58", label: "lanes" },
              { icon: <ShieldCheck className="h-4 w-4" />, value: "99.2%", label: "audit trail" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 backdrop-blur">
                <div className="mb-2 text-white/40">{item.icon}</div>
                <p className="font-mono text-lg text-white">{item.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/35">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-white/25">© {new Date().getFullYear()} Doxin Logistics Systems · SOC 2 controls ready</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900">
              <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
                <path d="M6 24V8h9c4.5 0 7.5 3 7.5 8s-3 8-7.5 8H6Zm5-4.2h3.7c2.1 0 3.4-1.3 3.4-3.8s-1.3-3.8-3.4-3.8H11v7.6Z" fill="#F5F5F1" />
                <circle cx="25" cy="24" r="3.4" fill="rgb(var(--signal-500))" />
              </svg>
            </span>
            <span className="text-lg font-semibold">doxin</span>
          </div>

          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-600">
            <Sparkles className="h-3 w-3" /> Operations console
          </p>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-ink-900">Welcome back</h2>
          <p className="mt-1 text-[13px] text-ink-500">Sign in to run your dispatch desk.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input h-10"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0" htmlFor="password">Password</label>
                <span className="text-[11px] text-ink-400">Contact admin to reset</span>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input h-10"
                placeholder="••••••••"
                required
              />
            </div>
            {error ? <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}
            <button type="submit" disabled={loading} className="btn-primary h-10 w-full disabled:opacity-60">
              {loading ? "Signing in…" : "Sign in to console"}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-ink-100 bg-white p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Demo account</p>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-ink-600">
              <p className="flex justify-between"><span>admin@doxin.com</span><span className="text-ink-400">administrator</span></p>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">Password: <span className="font-mono text-ink-600">Doxin@2026</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
