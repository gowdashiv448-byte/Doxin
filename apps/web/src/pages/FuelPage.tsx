import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fuel as FuelIcon, Plus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { canWrite, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, SearchInput, Select, StatCard } from "../components/ui";
import { dateTime, money, num } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;
const defaultForm = { truckId: "", driverId: "", purchaseDate: new Date().toISOString().slice(0, 16), locationCity: "", locationState: "", gallons: "", pricePerGallon: "", fuelCardNumber: "" };

export default function FuelPage() {
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "finance") || canWrite(user?.role, "ops");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["fuel", { search, page }],
    queryFn: () => api.get<Page<Row> & { summary: { totalCost: string; gallons: string; avgPrice: string } }>("/api/fuel", { search: search || undefined, page, pageSize: 25 }),
    placeholderData: (prev) => prev,
  });
  const { data: trucks } = useQuery({ queryKey: ["trucks", "options"], queryFn: () => api.get<Page<Row>>("/api/trucks", { pageSize: 200 }) });
  const { data: drivers } = useQuery({ queryKey: ["drivers", "options"], queryFn: () => api.get<Page<Row>>("/api/drivers", { pageSize: 200, employmentStatus: "Active" }) });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/api/fuel", payload),
    onSuccess: () => {
      toast.success("Fuel purchase logged");
      setOpen(false);
      setForm(defaultForm);
      void queryClient.invalidateQueries({ queryKey: ["fuel"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not log purchase"),
  });

  const submit = () => {
    setError("");
    if (!form.truckId || !form.gallons || !form.pricePerGallon) { setError("Tractor, gallons and price are required"); return; }
    create.mutate({
      truckId: form.truckId,
      driverId: form.driverId || null,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
      locationCity: form.locationCity || undefined,
      locationState: form.locationState || undefined,
      gallons: Number(form.gallons),
      pricePerGallon: Number(form.pricePerGallon),
      fuelCardNumber: form.fuelCardNumber || undefined,
    });
  };

  const estimated = Number(form.gallons || 0) * Number(form.pricePerGallon || 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Fuel"
        description="Fuel card transactions, price per gallon and spend by tractor."
        actions={canManage ? <Button variant="accent" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Log purchase</Button> : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fuel spend" value={money(data?.summary.totalCost)} sub="Matching current view" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Gallons" value={num(data?.summary.gallons, 1)} sub="Purchased" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Average price" value={`$${Number(data?.summary.avgPrice ?? 0).toFixed(3)}`} sub="Per gallon" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Transactions" value={num(data?.total ?? 0)} sub="Fuel card receipts" icon={<FuelIcon className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Truck, city, receipt ID…" />
          <span className="text-[11px] text-ink-400">{data?.total?.toLocaleString() ?? 0} receipts</span>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead><tr><th>Receipt</th><th>Date</th><th>Tractor</th><th>Driver</th><th>Location</th><th className="text-right">Gallons</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.fuelPurchaseId}>
                    <td className="mono text-[11px]">{row.fuelPurchaseId}</td>
                    <td className="text-[12px] text-ink-600">{dateTime(row.purchaseDate)}</td>
                    <td><p className="text-[12.5px] font-medium">Unit {row.truckUnit ?? row.truckId}</p><p className="mono text-[10.5px] text-ink-400">{row.fuelCardNumber}</p></td>
                    <td className="text-[12.5px]">{row.driverName ?? "—"}</td>
                    <td className="text-[12px]">{row.locationCity}, {row.locationState}</td>
                    <td className="text-right font-mono text-[12px]">{Number(row.gallons).toFixed(1)}</td>
                    <td className="text-right font-mono text-[12px]">${Number(row.pricePerGallon).toFixed(3)}</td>
                    <td className="text-right font-mono text-[12px] font-medium">{money(row.totalCost, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : <EmptyState title="No fuel purchases" description="Log a fuel card receipt to track spend per tractor." />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Log fuel purchase" description="Recorded against the tractor and, optionally, the driver." size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Save purchase</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tractor"><Select value={form.truckId} onChange={(e) => setForm((f) => ({ ...f, truckId: e.target.value }))}><option value="">Select tractor…</option>{trucks?.data.map((t) => <option key={t.truckId} value={t.truckId}>Unit {t.unitNumber} · {t.make}</option>)}</Select></Field>
          <Field label="Driver"><Select value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}><option value="">Unassigned</option>{drivers?.data.map((d) => <option key={d.driverId} value={d.driverId}>{d.firstName} {d.lastName}</option>)}</Select></Field>
          <Field label="Purchased at"><Input type="datetime-local" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></Field>
          <Field label="Fuel card"><Input value={form.fuelCardNumber} onChange={(e) => setForm((f) => ({ ...f, fuelCardNumber: e.target.value }))} /></Field>
          <Field label="Gallons"><Input type="number" step="0.01" value={form.gallons} onChange={(e) => setForm((f) => ({ ...f, gallons: e.target.value }))} /></Field>
          <Field label="Price per gallon"><Input type="number" step="0.001" value={form.pricePerGallon} onChange={(e) => setForm((f) => ({ ...f, pricePerGallon: e.target.value }))} /></Field>
          <Field label="City"><Input value={form.locationCity} onChange={(e) => setForm((f) => ({ ...f, locationCity: e.target.value }))} /></Field>
          <Field label="State"><Input value={form.locationState} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, locationState: e.target.value.toUpperCase() }))} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[12px]"><span className="text-ink-500">Calculated total</span><span className="font-mono font-medium text-ink-900">{money(estimated, 2)}</span></div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      </Modal>
    </>
  );
}
