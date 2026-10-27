import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ExternalLink, KeyRound, LogOut, Palette, ShieldCheck } from "lucide-react";
import { ROLE_LABELS, THEME_COLOR_LABELS, THEME_COLORS, type ThemeColor } from "@doxin/shared";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { THEME_SWATCHES } from "../lib/theme";
import { Badge, Button, Card, Field, Input, PageHeader } from "../components/ui";
import { dateTime } from "../lib/format";

export default function SettingsPage() {
  const { user, logout, themeColor, changeTheme } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState<ThemeColor | null>(null);
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: () => api.get<{ status: string; time: string }>("/health") });

  const chooseTheme = async (theme: ThemeColor) => {
    if (theme === themeColor || savingTheme) return;
    setSavingTheme(theme);
    try {
      await changeTheme(theme);
      toast.success(`${THEME_COLOR_LABELS[theme]} accent applied`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the accent color");
    } finally {
      setSavingTheme(null);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (newPassword !== confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword(""); setNewPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" description="Your account, security and workspace connections." />

      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink-900"><Palette className="h-4 w-4 text-ink-400" /> Accent color</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Choose the color used for primary actions, highlights and charts. Orange is the default.</p>
          </div>
          <Badge tone="neutral">Saved to your account</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEME_COLORS.map((theme) => {
            const selected = theme === themeColor;
            return (
              <button
                key={theme}
                type="button"
                aria-pressed={selected}
                disabled={Boolean(savingTheme)}
                onClick={() => void chooseTheme(theme)}
                className={clsx(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-60",
                  selected ? "border-ink-900 bg-ink-50" : "border-ink-200 bg-white hover:border-ink-300",
                )}
              >
                <span className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: THEME_SWATCHES[theme] }} />
                <span className="flex-1 text-[12px] font-medium text-ink-800">{THEME_COLOR_LABELS[theme]}</span>
                {savingTheme === theme ? <span className="text-[10px] text-ink-400">Saving…</span> : selected ? <Check className="h-4 w-4 text-ink-700" /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink-900">Profile</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Identity used across dispatch notes, audit logs and reports.</p>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-900 font-mono text-[16px] text-white">{user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
              <div>
                <p className="text-[16px] font-semibold text-ink-900">{user?.name}</p>
                <p className="text-[12px] text-ink-500">{user?.email}</p>
                <div className="mt-1.5"><Badge tone="info">{user ? ROLE_LABELS[user.role] : ""}</Badge></div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 rounded-lg border border-ink-100 bg-ink-50/50 p-3 sm:grid-cols-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Session</p><p className="mt-1 flex items-center gap-1 text-[12px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> JWT · 12h</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">API status</p><p className="mt-1 text-[12px] text-ink-700">{health?.status === "ok" ? "Operational" : "Checking…"}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Last checked</p><p className="mt-1 text-[12px] text-ink-700">{health?.time ? dateTime(health.time) : "—"}</p></div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink-900"><KeyRound className="h-4 w-4 text-ink-400" /> Change password</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">Use at least 8 characters. Existing sessions remain valid until expiry.</p>
            <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Current password"><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></Field>
              <Field label="New password"><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></Field>
              <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
              {error ? <p className="sm:col-span-3 text-[12px] text-red-700">{error}</p> : null}
              <div className="sm:col-span-3"><Button type="submit" variant="primary" loading={saving}>Update password</Button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink-900">Workspace</h2>
            <dl className="mt-3 space-y-2.5 text-[12px]">
              <div className="flex justify-between"><dt className="text-ink-500">Name</dt><dd className="font-medium">North America Ops</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Environment</dt><dd className="font-mono text-[11px]">{import.meta.env.DEV ? "development" : "production"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Region</dt><dd>us-central</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Version</dt><dd className="font-mono text-[11px]">1.0.0</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink-900">Developer</h2>
            <p className="mt-1 text-[12px] leading-5 text-ink-500">Interactive OpenAPI reference for every endpoint, auth included.</p>
            <a href="/docs" target="_blank" rel="noreferrer" className="btn-secondary mt-3 w-full"><ExternalLink className="h-3.5 w-3.5" /> Open API docs</a>
          </Card>
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-ink-900">Session</h2>
            <p className="mt-1 text-[12px] text-ink-500">Sign out of this device. Any unsaved form changes will be lost.</p>
            <Button variant="danger" className="mt-3 w-full" onClick={logout}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
