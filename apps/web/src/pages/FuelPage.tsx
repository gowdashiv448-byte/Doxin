import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fuel as FuelIcon, Plus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { canWrite, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useLanguage } from "../lib/language";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, SearchInput, Select, StatCard } from "../components/ui";
import { dateTime, money, num } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;
const defaultForm = { truckId: "", driverId: "", purchaseDate: new Date().toISOString().slice(0, 16), locationCity: "", locationState: "", gallons: "", pricePerGallon: "", fuelCardNumber: "" };

export default function FuelPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
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
    if (!form.truckId || !form.gallons || !form.pricePerGallon) { setError("Truck, gallons and price are required"); return; }
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
        eyebrow="Expenses"
        title="Fuel"
        description="Diesel purchases, price per litre and fuel expenses by truck."
        actions={canManage ? <Button variant="accent" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t("Add Fuel Entry")}</Button> : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Fuel Cost" value={money(data?.summary.totalCost)} sub="In current view" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Total Litres" value={num(data?.summary.gallons, 1)} sub="Diesel purchased" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Average Price" value={`₹${Number(data?.summary.avgPrice ?? 0).toFixed(2)}`} sub="Per Litre" icon={<FuelIcon className="h-4 w-4" />} />
        <StatCard label="Transactions" value={num(data?.total ?? 0)} sub="Fuel bills / receipts" icon={<FuelIcon className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("search…")} />
          <span className="text-[11px] text-ink-400">{data?.total?.toLocaleString() ?? 0} {t("receipts")}</span>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead><tr><th>{t("Receipt")}</th><th>{t("Date")}</th><th>{t("Truck")}</th><th>{t("Driver")}</th><th>{t("City")}</th><th className="text-right">{t("Litres")}</th><th className="text-right">{t("Price / L")}</th><th className="text-right">{t("Total")}</th></tr></thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.fuelPurchaseId}>
                    <td className="mono text-[11px]">{row.fuelPurchaseId}</td>
                    <td className="text-[12px] text-ink-600">{dateTime(row.purchaseDate)}</td>
                    <td><p className="text-[12.5px] font-medium">Unit {row.truckUnit ?? row.truckId}</p><p className="mono text-[10.5px] text-ink-400">{row.fuelCardNumber}</p></td>
                    <td className="text-[12.5px]">{row.driverName ?? "—"}</td>
                    <td className="text-[12px]">{row.locationCity}, {row.locationState}</td>
                    <td className="text-right font-mono text-[12px]">{Number(row.gallons).toFixed(1)} L</td>
                    <td className="text-right font-mono text-[12px]">₹{Number(row.pricePerGallon).toFixed(2)}</td>
                    <td className="text-right font-mono text-[12px] font-medium">{money(row.totalCost, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : <EmptyState title={t("No fuel entries")} description={t("Record a diesel purchase receipt to track fuel costs.")} />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Fuel Entry" description="Record diesel fuel expense for a truck and driver." size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button variant="primary" loading={create.isPending} onClick={submit}>{t("Save Entry")}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Truck")}><Select value={form.truckId} onChange={(e) => setForm((f) => ({ ...f, truckId: e.target.value }))}><option value="">{t("Select truck…")}</option>{trucks?.data.map((tItem) => <option key={tItem.truckId} value={tItem.truckId}>Unit {tItem.unitNumber} · {tItem.make}</option>)}</Select></Field>
          <Field label={t("Driver")}><Select value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}><option value="">{t("Unassigned")}</option>{drivers?.data.map((d) => <option key={d.driverId} value={d.driverId}>{d.firstName} {d.lastName}</option>)}</Select></Field>
          <Field label={t("Purchase Date / Time")}><Input type="datetime-local" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></Field>
          <Field label={t("Fuel Card / Slip No.")}><Input value={form.fuelCardNumber} onChange={(e) => setForm((f) => ({ ...f, fuelCardNumber: e.target.value }))} /></Field>
          <Field label={t("Litres")}><Input type="number" step="0.01" value={form.gallons} onChange={(e) => setForm((f) => ({ ...f, gallons: e.target.value }))} /></Field>
          <Field label={t("Price per Litre (₹)")}><Input type="number" step="0.01" value={form.pricePerGallon} onChange={(e) => setForm((f) => ({ ...f, pricePerGallon: e.target.value }))} /></Field>
          <Field label={t("City")}><Input value={form.locationCity} onChange={(e) => setForm((f) => ({ ...f, locationCity: e.target.value }))} /></Field>
          <Field label={t("State")}><Input value={form.locationState} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, locationState: e.target.value.toUpperCase() }))} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[12px]"><span className="text-ink-500">{t("Calculated Total")}</span><span className="font-mono font-medium text-ink-900">{money(estimated, 2)}</span></div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{t(error)}</p> : null}
      </Modal>
    </>
  );
}
