/**
 * Doxin shared domain model.
 * Types and business rules that must stay identical across API and web.
 */

export const ROLES = ["ADMIN", "PLATFORM_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PLATFORM_ADMIN: "Platform administrator",
};

export const THEME_COLORS = ["orange", "green", "blue", "purple"] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export const DEFAULT_THEME_COLOR: ThemeColor = "orange";

export const THEME_COLOR_LABELS: Record<ThemeColor, string> = {
  orange: "Orange",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

export const LOAD_STATUSES = [
  "DRAFT",
  "BOOKED",
  "PLANNED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "EXCEPTION",
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const TRIP_STATUSES = [
  "PLANNED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const DRIVER_STATUSES = ["ACTIVE", "INACTIVE", "TERMINATED", "ON_LEAVE"] as const;

export type LoadAction =
  | "book"
  | "plan"
  | "dispatch"
  | "start_transit"
  | "mark_delivered"
  | "complete"
  | "cancel"
  | "flag_exception"
  | "resolve_exception";

export const LOAD_ACTIONS: Record<LoadAction, { from: LoadStatus[]; to: LoadStatus; label: string }> = {
  book: { from: ["DRAFT"], to: "BOOKED", label: "Confirm booking" },
  plan: { from: ["BOOKED", "EXCEPTION", "PLANNED"], to: "PLANNED", label: "Assign resources" },
  dispatch: { from: ["PLANNED", "EXCEPTION"], to: "DISPATCHED", label: "Dispatch" },
  start_transit: { from: ["DISPATCHED"], to: "IN_TRANSIT", label: "Start transit" },
  mark_delivered: { from: ["IN_TRANSIT"], to: "DELIVERED", label: "Mark delivered" },
  complete: { from: ["DELIVERED"], to: "COMPLETED", label: "Close load" },
  cancel: { from: ["DRAFT", "BOOKED", "PLANNED", "DISPATCHED", "EXCEPTION"], to: "CANCELLED", label: "Cancel" },
  flag_exception: {
    from: ["BOOKED", "PLANNED", "DISPATCHED", "IN_TRANSIT", "DELIVERED"],
    to: "EXCEPTION",
    label: "Flag exception",
  },
  resolve_exception: { from: ["EXCEPTION"], to: "PLANNED", label: "Resolve exception" },
};

/**
 * Reachable statuses derived from the action rules above. Keeping this
 * derived means the transition map can never drift from server enforcement.
 */
export const LOAD_TRANSITIONS: Record<LoadStatus, LoadStatus[]> = Object.fromEntries(
  LOAD_STATUSES.map((status) => [
    status,
    [...new Set(Object.values(LOAD_ACTIONS).filter((rule) => rule.from.includes(status)).map((rule) => rule.to))],
  ]),
) as Record<LoadStatus, LoadStatus[]>;

export const STATUS_TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  BOOKED: "info",
  PLANNED: "info",
  DISPATCHED: "warning",
  IN_TRANSIT: "warning",
  DELIVERED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  EXCEPTION: "danger",
  ACTIVE: "success",
  INACTIVE: "neutral",
  TERMINATED: "danger",
  ON_LEAVE: "warning",
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  MAINTENANCE: "warning",
};

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  themeColor: ThemeColor;
  tenantId: string | null;
  tenantName: string | null;
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  shardKey: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  asOf: string;
  loadsToday: number;
  activeLoads: number;
  inTransit: number;
  deliveredToday: number;
  onTimeRate: number;
  exceptions: number;
  revenueToday: number;
  fuelSpend30d: number;
  maintenanceDue: number;
  activeDrivers: number;
  availableTrucks: number;
  utilizationRate: number;
}

export interface TrendPoint {
  date: string;
  loads: number;
  revenue: number;
  onTimeRate: number;
}

export const CARGO_TYPES = ["Dry Van", "Refrigerated"] as const;
export const BOOKING_TYPES = ["Spot", "Contract", "Dedicated"] as const;
export const CUSTOMER_TYPES = ["Spot", "Contract", "Dedicated"] as const;

export const BILL_STATUSES = ["GENERATED", "SENT", "PAID", "CANCELLED"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_EMAIL_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"] as const;
export type BillEmailStatus = (typeof BILL_EMAIL_STATUSES)[number];

export interface BillTripDetails {
  tripId?: string | null;
  loadId?: string;
  loadDate?: string;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  truckId?: string | null;
  truckUnit?: string | null;
  trailerId?: string | null;
  trailerNumber?: string | null;
  actualDistanceMiles?: number | null;
  typicalDistanceMiles?: number | null;
  dispatchDate?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  weightLbs?: number | null;
  pieces?: number | null;
  loadType?: string | null;
  bookingType?: string | null;
  poNumber?: string | null;
  [key: string]: unknown;
}

export interface BillChargesBreakdown {
  linehaul: number;
  fuelSurcharge: number;
  accessorialCharges: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  [key: string]: unknown;
}

export interface Bill {
  billId: string;
  tenantId: string;
  loadId: string;
  tripId: string | null;
  customerId: string;
  customerName?: string;
  billingAddress?: string | null;
  contactName?: string | null;
  dispatcherCompanyName: string;
  recipientEmail: string | null;
  s3Url: string;
  s3Bucket: string | null;
  s3Key: string;
  linehaulAmount: number;
  fuelSurcharge: number;
  accessorialCharges: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  tripDetails: BillTripDetails;
  chargesBreakdown: BillChargesBreakdown;
  status: BillStatus;
  emailStatus: BillEmailStatus;
  emailError?: string | null;
  emailSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSummary {
  asOf: string;
  totalInvoiced: number;
  totalSubtotal: number;
  totalGst: number;
  totalPaid: number;
  totalPending: number;
  billsCount: number;
  sentBillsCount: number;
}

export function canTransition(from: LoadStatus, action: LoadAction): boolean {
  return LOAD_ACTIONS[action]?.from.includes(from) ?? false;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}
