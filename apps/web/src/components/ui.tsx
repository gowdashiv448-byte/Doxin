import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { X, Loader2, Inbox, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { STATUS_TONES, type Page } from "@doxin/shared";

export function Button({
  variant = "secondary",
  size,
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm";
  loading?: boolean;
}) {
  const map = {
    primary: "btn-primary",
    accent: "btn-accent",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
  };
  return (
    <button
      className={clsx(map[variant], size === "sm" && "btn-sm", className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

const toneClasses = {
  neutral: "bg-ink-100 text-ink-600",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-100",
};

export function Badge({ status, children, tone }: { status?: string; children?: ReactNode; tone?: keyof typeof toneClasses }) {
  const resolved = tone ?? STATUS_TONES[status ?? ""] ?? "neutral";
  const label = children ?? (status ? status.replaceAll("_", " ") : "");
  return (
    <span className={clsx("badge", toneClasses[resolved])}>
      <span className="badge-dot opacity-70" />
      <span className="capitalize">{label}</span>
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-600">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && !error ? <p className="mt-1 text-[11px] text-ink-400">{hint}</p> : null}
      {error ? <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("input", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx("select", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("input h-auto min-h-[80px] py-2", className)} {...props} />;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx("relative max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-lift animate-rise", width)}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink-100 bg-white px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold tracking-tight text-ink-900">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-ink-500">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-100 bg-white px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children, width = "max-w-2xl" }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink-950/35 backdrop-blur-[1px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Details panel"
        className={clsx("absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-lift animate-slide-in", width)}
      >
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-50 text-ink-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-5 w-5 animate-spin text-ink-300", className)} />;
}

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <p className="text-[12px] text-ink-500">
        <span className="font-medium text-ink-700">{total.toLocaleString()}</span> records
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 font-mono text-[11px] text-ink-500">
          {page} / {totalPages}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      <input className="input w-64 pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-ink-100">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            "relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
            value === tab.value
              ? "border-ink-900 text-ink-900"
              : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className={clsx("rounded px-1.5 py-0.5 font-mono text-[10px]", value === tab.value ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-500")}>
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  icon?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">{label}</p>
        {icon ? <div className="text-ink-300">{icon}</div> : null}
      </div>
      <p className="mt-2 font-mono text-[26px] font-medium leading-none tracking-[-0.03em] text-ink-900 tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-[12px]">
        {delta ? (
          <span
            className={clsx(
              "font-medium",
              tone === "positive" && "text-emerald-700",
              tone === "negative" && "text-red-600",
              tone === "warning" && "text-amber-700",
              tone === "neutral" && "text-ink-500",
            )}
          >
            {delta}
          </span>
        ) : null}
        {sub ? <span className="text-ink-400">{sub}</span> : null}
      </div>
    </div>
  );
}

export function SectionTitle({ title, action, description }: { title: string; action?: ReactNode; description?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-2 pt-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[12px] text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("table-wrap", className)}>
      <table className="data-table">{children}</table>
    </div>
  );
}

export function pageOf<T>(data: Page<T> | undefined): Page<T> {
  return data ?? { data: [], page: 1, pageSize: 25, total: 0, totalPages: 1 };
}
