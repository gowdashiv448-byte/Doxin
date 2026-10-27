import { format, formatDistanceToNow, parseISO } from "date-fns";

export const money = (value: number | string | null | undefined, digits = 0) => {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(n);
};

export const compactMoney = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return money(n);
};

export const num = (value: number | string | null | undefined, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value ?? 0));

export const pct = (value: number | string | null | undefined, digits = 1) => `${Number(value ?? 0).toFixed(digits)}%`;

export const date = (value: string | null | undefined, fallback = "—") => {
  if (!value) return fallback;
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return fallback;
  }
};

export const dateTime = (value: string | null | undefined, fallback = "—") => {
  if (!value) return fallback;
  try {
    return format(parseISO(value), "MMM d, HH:mm");
  } catch {
    return fallback;
  }
};

export const relative = (value: string | null | undefined) => {
  if (!value) return "—";
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return "—";
  }
};

export const titleCase = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const today = () => new Date().toISOString().slice(0, 10);
