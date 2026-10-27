import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { canWrite, useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from "../components/ui";
import { date, dateTime, money, num } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;
const defaultForm = { driverId: "", truckId: "", incidentType: "Accident", incidentDate: new Date().toISOString().slice(0, 16), locationCity: "", locationState: "", atFaultFlag: false, injuryFlag: false, preventableFlag: false, vehicleDamageCost: "", cargoDamageCost: "", claimAmount: "", description: "" };

export default function SafetyPage() {
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "safety");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["safety", { search, status, page }],
    queryFn: () => api.get<Page<Row> & { summary: { incidents: number; injuries: number; preventable: number; claimTotal: string } }>("/api/safety", { search: search || undefined, status: status === "ALL" ? undefined : status, page, pageSize: 25 }),
    placeholderData: (prev) => prev,
  });
  const { data: drivers } = useQuery({ queryKey: ["drivers", "options"], queryFn: () => api.get<Page<Row>>("/api/drivers", { pageSize: 200, employmentStatus: "Active" }) });
  const { data: trucks } = useQuery({ queryKey: ["trucks", "options"], queryFn: () => api.get<Page<Row>>("/api/trucks", { pageSize: 200 }) });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/api/safety", payload),
    onSuccess: () => {
      toast.success("Safety incident recorded");
      setOpen(false);
      setForm(defaultForm);
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not record incident"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => api.patch(`/api/safety/${id}/status`, { status: next }),
    onSuccess: () => { toast.success("Incident status updated"); void queryClient.invalidateQueries({ queryKey: ["safety"] }); },
  });

  const submit = () => {
    setError("");
    create.mutate({
      driverId: form.driverId || null,
      truckId: form.truckId || null,
      incidentType: form.incidentType,
      incidentDate: form.incidentDate ? new Date(form.incidentDate).toISOString() : undefined,
      locationCity: form.locationCity || undefined,
      locationState: form.locationState || undefined,
      atFaultFlag: form.atFaultFlag,
      injuryFlag: form.injuryFlag,
      preventableFlag: form.preventableFlag,
      vehicleDamageCost: Number(form.vehicleDamageCost || 0),
      cargoDamageCost: Number(form.cargoDamageCost || 0),
      claimAmount: Number(form.claimAmount || 0),
      description: form.description || undefined,
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Risk"
        title="Safety"
        description="Incidents, claims and preventable-event tracking across drivers and equipment."
        actions={canManage ? <Button variant="accent" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record incident</Button> : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Incidents" value={num(data?.summary.incidents ?? 0)} sub="Matching current view" icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Injuries" value={num(data?.summary.injuries ?? 0)} sub="Reported" tone={Number(data?.summary.injuries) ? "negative" : "neutral"} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Preventable" value={num(data?.summary.preventable ?? 0)} sub="Coaching candidates" tone="warning" icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Claims" value={money(data?.summary.claimTotal)} sub="Total claim value" tone="negative" icon={<Wallet className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Incident, driver, truck…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40"><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="UNDER_REVIEW">Under review</option><option value="CLOSED">Closed</option></Select>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead><tr><th>Incident</th><th>Date</th><th>Type</th><th>Driver / truck</th><th>Location</th><th className="text-right">Claim</th><th>Flags</th><th>Status</th></tr></thead>
              <tbody>
                {data.data.map((incident) => (
                  <tr key={incident.incidentId}>
                    <td className="mono text-[11px]">{incident.incidentId}</td>
                    <td className="text-[12px] text-ink-600">{dateTime(incident.incidentDate)}</td>
                    <td><Badge tone={incident.incidentType === "Accident" ? "danger" : "warning"}>{incident.incidentType}</Badge></td>
                    <td><p className="text-[12.5px]">{incident.driverName ?? "—"}</p><p className="mono text-[10.5px] text-ink-400">Unit {incident.truckUnit ?? "—"}</p></td>
                    <td className="text-[12px]">{incident.locationCity}, {incident.locationState}</td>
                    <td className="text-right font-mono text-[12px]">{money(incident.claimAmount, 2)}</td>
                    <td className="space-x-1">
                      {incident.injuryFlag ? <span className="badge bg-red-50 text-red-700">Injury</span> : null}
                      {incident.preventableFlag ? <span className="badge bg-amber-50 text-amber-700">Preventable</span> : null}
                      {incident.atFaultFlag ? <span className="badge bg-ink-100 text-ink-600">At fault</span> : null}
                    </td>
                    <td>
                      {canManage ? (
                        <Select className="h-7 w-32 text-[11px]" value={incident.status} onChange={(e) => updateStatus.mutate({ id: incident.incidentId, next: e.target.value })}>
                          <option value="OPEN">Open</option><option value="UNDER_REVIEW">Under review</option><option value="CLOSED">Closed</option>
                        </Select>
                      ) : <Badge status={incident.status} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : <EmptyState title="No incidents" description="The safety log is clear for this filter." />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record safety incident" description="File the incident now; assign a claim owner and review status later." size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Record incident</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Incident type"><Select value={form.incidentType} onChange={(e) => setForm((f) => ({ ...f, incidentType: e.target.value }))}>{["Accident", "Moving Violation", "DOT Violation", "Equipment Damage", "Customer Complaint"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="When"><Input type="datetime-local" value={form.incidentDate} onChange={(e) => setForm((f) => ({ ...f, incidentDate: e.target.value }))} /></Field>
          <Field label="Driver"><Select value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}><option value="">Unassigned</option>{drivers?.data.map((d) => <option key={d.driverId} value={d.driverId}>{d.firstName} {d.lastName}</option>)}</Select></Field>
          <Field label="Tractor"><Select value={form.truckId} onChange={(e) => setForm((f) => ({ ...f, truckId: e.target.value }))}><option value="">Unassigned</option>{trucks?.data.map((t) => <option key={t.truckId} value={t.truckId}>Unit {t.unitNumber}</option>)}</Select></Field>
          <Field label="City"><Input value={form.locationCity} onChange={(e) => setForm((f) => ({ ...f, locationCity: e.target.value }))} /></Field>
          <Field label="State"><Input maxLength={2} value={form.locationState} onChange={(e) => setForm((f) => ({ ...f, locationState: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Vehicle damage"><Input type="number" value={form.vehicleDamageCost} onChange={(e) => setForm((f) => ({ ...f, vehicleDamageCost: e.target.value }))} /></Field>
          <Field label="Cargo damage"><Input type="number" value={form.cargoDamageCost} onChange={(e) => setForm((f) => ({ ...f, cargoDamageCost: e.target.value }))} /></Field>
          <Field label="Claim amount"><Input type="number" value={form.claimAmount} onChange={(e) => setForm((f) => ({ ...f, claimAmount: e.target.value }))} /></Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            {[["atFaultFlag", "At fault"], ["injuryFlag", "Injury reported"], ["preventableFlag", "Preventable"]].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[12px] text-ink-700">
                <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} className="h-3.5 w-3.5 rounded border-ink-300" /> {label}
              </label>
            ))}
          </div>
          <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What happened?" /></Field>
        </div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      </Modal>
    </>
  );
}
