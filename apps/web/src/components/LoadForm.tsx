import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, X, Building2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { useLanguage } from "../lib/language";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { money } from "../lib/format";
import { today } from "../lib/format";

interface OptionPage<T> {
  data: T[];
}

export interface LoadFormValues {
  customerId: string;
  routeId: string;
  loadDate: string;
  loadType: string;
  weightLbs: string;
  pieces: string;
  revenue: string;
  fuelSurcharge: string;
  accessorialCharges: string;
  bookingType: string;
  poNumber: string;
  targetDeliveryDate: string;
  notes: string;
}

const initial: LoadFormValues = {
  customerId: "",
  routeId: "",
  loadDate: today(),
  loadType: "Dry Van",
  weightLbs: "",
  pieces: "",
  revenue: "",
  fuelSurcharge: "",
  accessorialCharges: "0",
  bookingType: "Contract",
  poNumber: "",
  targetDeliveryDate: "",
  notes: "",
};

export function LoadForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<LoadFormValues>(initial);
  const [error, setError] = useState("");
  const [bookNow, setBookNow] = useState(true);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [createdCustomers, setCreatedCustomers] = useState<Array<{ customerId: string; customerName: string; accountStatus: string }>>([]);
  const [newCustomerData, setNewCustomerData] = useState({
    customerName: "",
    customerType: "Contract",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    billingAddress: "",
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: customers } = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => api.get<OptionPage<{ customerId: string; customerName: string; accountStatus: string }>>("/api/customers", { pageSize: 200, sort: "name", order: "asc" }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: lanes } = useQuery({
    queryKey: ["routes", "options"],
    queryFn: () => api.get<OptionPage<{ routeId: string; originCity: string; originState: string; destinationCity: string; destinationState: string; typicalDistanceMiles: number; baseRatePerMile: string; fuelSurchargeRate: string }>>("/api/routes", { pageSize: 200, sort: "lane", order: "asc" }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const allCustomerOptions = useMemo(() => {
    const list = [...(customers?.data ?? [])];
    for (const created of createdCustomers) {
      if (!list.some((c) => c.customerId === created.customerId)) {
        list.unshift(created);
      }
    }
    return list;
  }, [customers?.data, createdCustomers]);

  const createCustomerMutation = useMutation({
    mutationFn: (payload: {
      customerName: string;
      customerType: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      billingAddress?: string;
      creditTermsDays: number;
      accountStatus: string;
    }) => api.post<{ customerId: string; customerName: string }>("/api/customers", payload),
    onSuccess: (newCust) => {
      toast.success(`Customer "${newCust.customerName}" added and selected`);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setCreatedCustomers((prev) => [{ customerId: newCust.customerId, customerName: newCust.customerName, accountStatus: "Active" }, ...prev]);
      setValues((current) => ({ ...current, customerId: newCust.customerId }));
      setShowNewCustomer(false);
      setNewCustomerData({
        customerName: "",
        customerType: "Contract",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        billingAddress: "",
      });
      setCustomerError("");
    },
    onError: (err) => {
      setCustomerError(err instanceof ApiError ? err.message : "Could not create customer");
    },
  });

  const selectedLane = useMemo(() => lanes?.data.find((l) => l.routeId === values.routeId), [lanes, values.routeId]);
  const estimated = selectedLane
    ? Math.round(selectedLane.typicalDistanceMiles * Number(selectedLane.baseRatePerMile) * 100) / 100
    : 0;

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ loadId: string }>("/api/loads", payload),
    onSuccess: (created) => {
      toast.success(`Load ${created.loadId} created${bookNow ? " and booked" : " as draft"}`);
      void queryClient.invalidateQueries({ queryKey: ["loads"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setValues(initial);
      setShowNewCustomer(false);
      onClose();
      if (onCreated) onCreated(created.loadId);
      else navigate(`/loads?open=${created.loadId}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create load"),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    mutation.mutate({
      customerId: values.customerId,
      routeId: values.routeId,
      loadDate: values.loadDate,
      loadType: values.loadType,
      bookingType: values.bookingType,
      weightLbs: values.weightLbs ? Number(values.weightLbs) : undefined,
      pieces: values.pieces ? Number(values.pieces) : undefined,
      revenue: values.revenue ? Number(values.revenue) : undefined,
      fuelSurcharge: values.fuelSurcharge ? Number(values.fuelSurcharge) : undefined,
      accessorialCharges: Number(values.accessorialCharges || 0),
      poNumber: values.poNumber || undefined,
      notes: values.notes || undefined,
      targetDeliveryDate: values.targetDeliveryDate || undefined,
      book: bookNow,
    });
  };

  const set = <K extends keyof LoadFormValues>(key: K, value: LoadFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Trip"
      description="Book and dispatch a new freight trip."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="accent" loading={mutation.isPending} onClick={submit}>{t("Create Trip")}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">{t("Customer / Party")}</span>
              <button
                type="button"
                onClick={() => {
                  setShowNewCustomer(!showNewCustomer);
                  setCustomerError("");
                }}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-signal-600 hover:text-signal-700 hover:underline"
              >
                {showNewCustomer ? (
                  <>
                    <X className="h-3 w-3" /> {t("Cancel")}
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" /> {t("Add new customer")}
                  </>
                )}
              </button>
            </div>
            <Select
              value={values.customerId}
              onChange={(e) => set("customerId", e.target.value)}
              required={!showNewCustomer}
            >
              <option value="">{t("Select a customer…")}</option>
              {allCustomerOptions.map((c) => (
                <option key={c.customerId} value={c.customerId} disabled={c.accountStatus !== "Active"}>
                  {c.customerName}
                </option>
              ))}
            </Select>
          </div>

          <Field label={t("Route")}>
            <Select value={values.routeId} onChange={(e) => set("routeId", e.target.value)} required>
              <option value="">{t("Select route…")}</option>
              {lanes?.data.map((lane) => (
                <option key={lane.routeId} value={lane.routeId}>
                  {lane.originCity}, {lane.originState} → {lane.destinationCity}, {lane.destinationState} · {lane.typicalDistanceMiles} km
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Inline Customer Creation Box */}
        {showNewCustomer ? (
          <div className="rounded-xl border border-signal-200/80 bg-signal-50/40 p-4 space-y-3.5 animate-modal-in transform-gpu">
            <div className="flex items-center justify-between border-b border-signal-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-signal-500 text-white">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-ink-900">{t("Add New Customer")}</h4>
                  <p className="text-[11px] text-ink-500">{t("Saves to customer records and selects automatically")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomer(false)}
                className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="label">{t("Customer / Company Name")} *</span>
                <Input
                  value={newCustomerData.customerName}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, customerName: e.target.value }))}
                  placeholder="e.g. Mahindra Logistics Ltd."
                  required
                  autoFocus
                />
              </div>

              <div>
                <span className="label">{t("Account Type")}</span>
                <Select
                  value={newCustomerData.customerType}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, customerType: e.target.value }))}
                >
                  <option value="Contract">{t("Contract")}</option>
                  <option value="Spot">{t("Spot")}</option>
                  <option value="Dedicated">{t("Dedicated")}</option>
                </Select>
              </div>

              <div>
                <span className="label">{t("Billing Email")}</span>
                <Input
                  type="email"
                  value={newCustomerData.contactEmail}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="accounts@company.com"
                />
              </div>

              <div>
                <span className="label">{t("Contact Person")}</span>
                <Input
                  value={newCustomerData.contactName}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, contactName: e.target.value }))}
                  placeholder="Rajesh Kumar"
                />
              </div>

              <div>
                <span className="label">{t("Contact Phone")}</span>
                <Input
                  type="tel"
                  value={newCustomerData.contactPhone}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="sm:col-span-2">
                <span className="label">{t("Billing Address")}</span>
                <Input
                  value={newCustomerData.billingAddress}
                  onChange={(e) => setNewCustomerData((prev) => ({ ...prev, billingAddress: e.target.value }))}
                  placeholder="Plot 12, Industrial Area, Mumbai, MH"
                />
              </div>
            </div>

            {customerError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                {t(customerError)}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-signal-100 pt-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewCustomer(false)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                loading={createCustomerMutation.isPending}
                disabled={!newCustomerData.customerName.trim()}
                onClick={() => {
                  if (!newCustomerData.customerName.trim()) return;
                  createCustomerMutation.mutate({
                    customerName: newCustomerData.customerName.trim(),
                    customerType: newCustomerData.customerType,
                    contactName: newCustomerData.contactName.trim() || undefined,
                    contactEmail: newCustomerData.contactEmail.trim() || undefined,
                    contactPhone: newCustomerData.contactPhone.trim() || undefined,
                    billingAddress: newCustomerData.billingAddress.trim() || undefined,
                    creditTermsDays: 30,
                    accountStatus: "Active",
                  });
                }}
              >
                {t("Save & Select Customer")}
              </Button>
            </div>
          </div>
        ) : null}

        {selectedLane ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3.5 py-3">
            <div className="text-[12px] text-ink-600">
              <span className="font-mono text-ink-900">{selectedLane.typicalDistanceMiles.toLocaleString()} km</span> {t("route")} ·{" "}
              <span className="font-mono text-ink-900">₹{Number(selectedLane.baseRatePerMile).toFixed(2)}/km</span> {t("rate")}
            </div>
            <div className="text-[12px] text-ink-500">{t("Suggested Freight")} <span className="font-mono font-medium text-ink-900">{money(estimated, 2)}</span></div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Pickup Date")}>
            <Input type="date" value={values.loadDate} onChange={(e) => set("loadDate", e.target.value)} required />
          </Field>
          <Field label={t("Delivery Target")}>
            <Input type="date" value={values.targetDeliveryDate} onChange={(e) => set("targetDeliveryDate", e.target.value)} />
          </Field>
          <Field label={t("Booking Type")}>
            <Select value={values.bookingType} onChange={(e) => set("bookingType", e.target.value)}>
              <option value="Spot">{t("Spot")}</option>
              <option value="Contract">{t("Contract")}</option>
              <option value="Dedicated">{t("Dedicated")}</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Body / Vehicle Type")}>
            <Select value={values.loadType} onChange={(e) => set("loadType", e.target.value)}>
              <option value="Dry Van">{t("Dry Van")}</option>
              <option value="Refrigerated">{t("Refrigerated")}</option>
            </Select>
          </Field>
          <Field label={t("Weight (kg)")}>
            <Input type="number" min={0} value={values.weightLbs} onChange={(e) => set("weightLbs", e.target.value)} placeholder="15000" />
          </Field>
          <Field label={t("Pieces / Boxes")}>
            <Input type="number" min={0} value={values.pieces} onChange={(e) => set("pieces", e.target.value)} placeholder="20" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Freight Rate")} hint={estimated ? `${t("Suggested")} ${money(estimated)}` : undefined}>
            <Input type="number" min={0} step="0.01" value={values.revenue} onChange={(e) => set("revenue", e.target.value)} placeholder={estimated ? estimated.toFixed(2) : "0.00"} />
          </Field>
          <Field label={t("Fuel Extra")}>
            <Input type="number" min={0} step="0.01" value={values.fuelSurcharge} onChange={(e) => set("fuelSurcharge", e.target.value)} placeholder={t("Auto calculated")} />
          </Field>
          <Field label={t("Other Charges")}>
            <Input type="number" min={0} step="0.01" value={values.accessorialCharges} onChange={(e) => set("accessorialCharges", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("PO / Bilty No.")}>
            <Input value={values.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder={t("Optional reference")} />
          </Field>
          <Field label={t("Trip Notes")}>
            <Input value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("Special delivery instructions…")} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-100 bg-white p-3">
          <input type="checkbox" checked={bookNow} onChange={(e) => setBookNow(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 text-signal-500 focus:ring-signal-500" />
          <span>
            <span className="block text-[13px] font-medium text-ink-800">{t("Confirm booking immediately")}</span>
            <span className="block text-[11px] text-ink-500">{t("Uncheck to save as draft before final confirmation.")}</span>
          </span>
        </label>

        {error ? <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{t(error)}</div> : null}
      </form>
    </Modal>
  );
}
