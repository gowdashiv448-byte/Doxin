import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
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
  const [values, setValues] = useState<LoadFormValues>(initial);
  const [error, setError] = useState("");
  const [bookNow, setBookNow] = useState(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: customers } = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => api.get<OptionPage<{ customerId: string; customerName: string; accountStatus: string }>>("/api/customers", { pageSize: 200, sort: "name", order: "asc" }),
    enabled: open,
  });
  const { data: lanes } = useQuery({
    queryKey: ["routes", "options"],
    queryFn: () => api.get<OptionPage<{ routeId: string; originCity: string; originState: string; destinationCity: string; destinationState: string; typicalDistanceMiles: number; baseRatePerMile: string; fuelSurchargeRate: string }>>("/api/routes", { pageSize: 200, sort: "lane", order: "asc" }),
    enabled: open,
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
      title="Create a load"
      description="Quote, book and hand off to dispatch in one step."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={mutation.isPending} onClick={submit}>Create load</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer">
            <Select value={values.customerId} onChange={(e) => set("customerId", e.target.value)} required>
              <option value="">Select a customer…</option>
              {customers?.data.map((c) => (
                <option key={c.customerId} value={c.customerId} disabled={c.accountStatus !== "Active"}>
                  {c.customerName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lane">
            <Select value={values.routeId} onChange={(e) => set("routeId", e.target.value)} required>
              <option value="">Select a lane…</option>
              {lanes?.data.map((lane) => (
                <option key={lane.routeId} value={lane.routeId}>
                  {lane.originCity}, {lane.originState} → {lane.destinationCity}, {lane.destinationState} · {lane.typicalDistanceMiles} mi
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {selectedLane ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3.5 py-3">
            <div className="text-[12px] text-ink-600">
              <span className="font-mono text-ink-900">{selectedLane.typicalDistanceMiles.toLocaleString()} mi</span> lane ·{" "}
              <span className="font-mono text-ink-900">${Number(selectedLane.baseRatePerMile).toFixed(2)}/mi</span> base rate
            </div>
            <div className="text-[12px] text-ink-500">Suggested linehaul <span className="font-mono font-medium text-ink-900">{money(estimated, 2)}</span></div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Load date">
            <Input type="date" value={values.loadDate} onChange={(e) => set("loadDate", e.target.value)} required />
          </Field>
          <Field label="Delivery target">
            <Input type="date" value={values.targetDeliveryDate} onChange={(e) => set("targetDeliveryDate", e.target.value)} />
          </Field>
          <Field label="Booking type">
            <Select value={values.bookingType} onChange={(e) => set("bookingType", e.target.value)}>
              <option>Spot</option>
              <option>Contract</option>
              <option>Dedicated</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Equipment">
            <Select value={values.loadType} onChange={(e) => set("loadType", e.target.value)}>
              <option>Dry Van</option>
              <option>Refrigerated</option>
            </Select>
          </Field>
          <Field label="Weight (lbs)">
            <Input type="number" min={0} value={values.weightLbs} onChange={(e) => set("weightLbs", e.target.value)} placeholder="e.g. 24000" />
          </Field>
          <Field label="Pieces">
            <Input type="number" min={0} value={values.pieces} onChange={(e) => set("pieces", e.target.value)} placeholder="e.g. 18" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Linehaul revenue" hint={estimated ? `Suggested ${money(estimated)}` : undefined}>
            <Input type="number" min={0} step="0.01" value={values.revenue} onChange={(e) => set("revenue", e.target.value)} placeholder={estimated ? estimated.toFixed(2) : "0.00"} />
          </Field>
          <Field label="Fuel surcharge">
            <Input type="number" min={0} step="0.01" value={values.fuelSurcharge} onChange={(e) => set("fuelSurcharge", e.target.value)} placeholder="Auto from lane" />
          </Field>
          <Field label="Accessorials">
            <Input type="number" min={0} step="0.01" value={values.accessorialCharges} onChange={(e) => set("accessorialCharges", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer PO / reference">
            <Input value={values.poNumber} onChange={(e) => set("poNumber", e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Notes">
            <Input value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Special instructions…" />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-100 bg-white p-3">
          <input type="checkbox" checked={bookNow} onChange={(e) => setBookNow(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 text-signal-500 focus:ring-signal-500" />
          <span>
            <span className="block text-[13px] font-medium text-ink-800">Confirm booking immediately</span>
            <span className="block text-[11px] text-ink-500">Uncheck to keep this as a draft while you confirm customer details.</span>
          </span>
        </label>

        {error ? <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}
      </form>
    </Modal>
  );
}
