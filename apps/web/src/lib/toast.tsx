import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<{ push: (kind: Kind, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-ink-100 bg-white p-3.5 shadow-lift animate-rise"
          >
            {toast.kind === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            {toast.kind === "error" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
            {toast.kind === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />}
            <p className="flex-1 text-[13px] leading-5 text-ink-800">{toast.message}</p>
            <button
              className="text-ink-400 hover:text-ink-700"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return {
    success: (message: string) => context.push("success", message),
    error: (message: string) => context.push("error", message),
    info: (message: string) => context.push("info", message),
  };
}
