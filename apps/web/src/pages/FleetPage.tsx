import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Wrench } from "lucide-react";
import { canWrite, useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, DataTable, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard, Tabs, Textarea } from "../components/ui";
import { MasterDataPage } from "../components/MasterDataPage";
import { date, money, num } from "../lib/format";

type Row = Record<string, any>;

export default function FleetPage() {
  const [tab, setTab] = useState<"trucks" | "trailers" | "maintenance">("trucks");
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "fleet");

  const tabs = (
    <div className="mb-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "trucks", label: "Tractors" },
          { value: "trailers", label: "Trailers" },
          { value: "maintenance", label: "Maintenance" },
        ]}
      />
    </div>
  );

  if (tab === "maintenance") return <MaintenancePanel tabs={tabs} canManage={canManage} />;

  if (tab === "trailers") {
    return (
      <MasterDataPage
        eyebrow="Fleet"
        title="Trailers"
        description="Trailer inventory by type, model year and current location."
        path="/api/trailers"
        idKey="trailerId"
        canManage={canManage}
        pageSize={30}
        headerExtra={tabs}
        searchPlaceholder="Trailer number, ID, location…"
        filters={[{ key: "status", label: "status", column: "status", options: ["Active", "Maintenance", "Inactive"].map((v) => ({ value: v, label: v })) }, { key: "type", label: "type", column: "trailer_type", options: [{ value: "Dry Van", label: "Dry Van" }, { value: "Refrigerated", label: "Refrigerated" }] }]}
        columns={[
          { key: "trailerNumber", label: "Trailer", render: (row) => <div><p className="text-[13px] font-medium text-ink-900">#{row.trailerNumber}</p><p className="mono text-[10.5px] text-ink-400">{row.trailerId}</p></div> },
          { key: "trailerType", label: "Type", render: (row) => <Badge tone="info">{row.trailerType}</Badge> },
          { key: "lengthFeet", label: "Length", render: (row) => `${row.lengthFeet ?? "—"} ft` },
          { key: "modelYear", label: "Model year", render: (row) => <span className="font-mono">{row.modelYear ?? "—"}</span> },
          { key: "currentLocation", label: "Location" },
          { key: "status", label: "Status", render: (row) => <Badge status={String(row.status).toUpperCase()} /> },
        ]}
        fields={[
          { key: "trailerNumber", label: "Trailer number", required: true },
          { key: "trailerType", label: "Type", type: "select", required: true, options: [{ value: "Dry Van", label: "Dry Van" }, { value: "Refrigerated", label: "Refrigerated" }] },
          { key: "lengthFeet", label: "Length (ft)", type: "number" },
          { key: "modelYear", label: "Model year", type: "number" },
          { key: "currentLocation", label: "Current location" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Maintenance", "Inactive"].map((v) => ({ value: v, label: v })) },
          { key: "vin", label: "VIN", span: 2 },
          { key: "acquisitionDate", label: "Acquired", type: "date" },
        ]}
        defaults={{ trailerType: "Dry Van", status: "Active", lengthFeet: "53" }}
      />
    );
  }

  return (
    <MasterDataPage
      eyebrow="Fleet"
      title="Tractors"
      description="Power units, odometer, service status and terminal assignment."
      path="/api/trucks"
      idKey="truckId"
      canManage={canManage}
      pageSize={30}
      headerExtra={tabs}
      searchPlaceholder="Unit number, make, VIN, terminal…"
      filters={[{ key: "status", label: "status", column: "status", options: ["Active", "Maintenance", "Inactive"].map((v) => ({ value: v, label: v })) }]}
      columns={[
        { key: "unitNumber", label: "Tractor", render: (row) => <div><p className="text-[13px] font-medium text-ink-900">Unit {row.unitNumber}</p><p className="mono text-[10.5px] text-ink-400">{row.truckId} · {row.vin?.slice(0, 12) ?? ""}</p></div> },
        { key: "make", label: "Make / model", render: (row) => <span>{row.make} {row.modelYear}</span> },
        { key: "currentOdometer", label: "Odometer", align: "right", render: (row) => <span className="font-mono">{row.currentOdometer ? `${num(row.currentOdometer)} mi` : "—"}</span> },
        { key: "homeTerminal", label: "Terminal" },
        { key: "nextServiceDue", label: "Next service", render: (row) => <span className={row.nextServiceDue && row.nextServiceDue < new Date().toISOString().slice(0, 10) ? "font-medium text-red-600" : ""}>{row.nextServiceDue ? date(row.nextServiceDue) : "—"}</span> },
        { key: "status", label: "Status", render: (row) => <Badge status={String(row.status).toUpperCase()} /> },
      ]}
      fields={[
        { key: "unitNumber", label: "Unit number", required: true },
        { key: "make", label: "Make", required: true },
        { key: "modelYear", label: "Model year", type: "number" },
        { key: "vin", label: "VIN" },
        { key: "acquisitionDate", label: "Acquired", type: "date" },
        { key: "acquisitionMileage", label: "Acquisition mileage", type: "number" },
        { key: "currentOdometer", label: "Current odometer", type: "number" },
        { key: "tankCapacityGallons", label: "Tank capacity (gal)", type: "number" },
        { key: "homeTerminal", label: "Home terminal" },
        { key: "status", label: "Status", type: "select", options: ["Active", "Maintenance", "Inactive"].map((v) => ({ value: v, label: v })) },
        { key: "lastServiceDate", label: "Last service", type: "date" },
        { key: "nextServiceDue", label: "Next service due", type: "date" },
      ]}
      defaults={{ status: "Active", fuelType: "Diesel" }}
    />
  );
}

function MaintenancePanel({ tabs, canManage }: { tabs: React.ReactNode; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ truckId: "", maintenanceType: "Preventive", maintenanceDate: new Date().toISOString().slice(0, 10), odometerReading: "", laborCost: "", partsCost: "", downtimeHours: "", facilityLocation: "", serviceDescription: "", status: "SCHEDULED" });
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance", "list"],
    queryFn: () => api.get<{ data: Row[]; summary: { totalCost: string; downtimeHours: string; events: number } }>("/api/maintenance", { pageSize: 50 }),
  });
  const { data: due } = useQuery({ queryKey: ["maintenance", "due"], queryFn: () => api.get<{ data: Row[] }>("/api/maintenance/due") });
  const { data: trucks } = useQuery({ queryKey: ["trucks", "options"], queryFn: () => api.get<{ data: Row[] }>("/api/trucks", { pageSize: 200 }) });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/api/maintenance", payload),
    onSuccess: () => {
      toast.success("Maintenance record created");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create record"),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/api/maintenance/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Maintenance status updated");
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["trucks"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const submit = () => {
    setError("");
    if (!values.truckId) { setError("Select a tractor"); return; }
    create.mutate({
      truckId: values.truckId,
      maintenanceType: values.maintenanceType,
      maintenanceDate: values.maintenanceDate,
      odometerReading: values.odometerReading ? Number(values.odometerReading) : undefined,
      laborCost: Number(values.laborCost || 0),
      partsCost: Number(values.partsCost || 0),
      downtimeHours: Number(values.downtimeHours || 0),
      facilityLocation: values.facilityLocation || undefined,
      serviceDescription: values.serviceDescription || undefined,
      status: values.status,
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Fleet"
        title="Maintenance"
        description="Service history, scheduled work and tractors approaching the PM window."
        actions={<Button variant="accent" onClick={() => setOpen(true)} disabled={!canManage}><Plus className="h-4 w-4" /> Schedule service</Button>}
      />
      {tabs}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total maintenance cost" value={money(data?.summary.totalCost)} sub={`${data?.summary.events ?? 0} records`} icon={<Wrench className="h-4 w-4" />} />
        <StatCard label="Downtime hours" value={num(data?.summary.downtimeHours, 1)} sub="All completed work" icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Service window" value={num(due?.data.length ?? 0)} sub="Tractors due within 14 days" tone="warning" icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="In the shop" value={num(trucks?.data.filter((t) => t.status === "Maintenance").length ?? 0)} sub="Marked maintenance" icon={<Wrench className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="border-b border-ink-100 px-4 py-3"><h2 className="text-[14px] font-semibold text-ink-900">Maintenance records</h2></div>
          {isLoading ? <LoadingBlock /> : (
            <DataTable>
              <thead><tr><th>Record</th><th>Tractor</th><th>Type</th><th>Date</th><th>Cost</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.data.map((record) => (
                  <tr key={record.maintenanceId}>
                    <td className="mono text-[11px]">{record.maintenanceId}</td>
                    <td><p className="text-[13px] font-medium">Unit {record.truckUnit}</p><p className="text-[10.5px] text-ink-400">{record.truckId}</p></td>
                    <td>{record.maintenanceType}</td>
                    <td className="text-[12px]">{date(record.maintenanceDate)}</td>
                    <td className="font-mono text-[12px]">{money(record.totalCost, 2)}</td>
                    <td><Badge status={record.status} /></td>
                    <td className="text-right">
                      {canManage && record.status !== "COMPLETED" && record.status !== "CANCELLED" ? (
                        <Select
                          className="h-7 w-32 text-[11px]"
                          value={record.status}
                          onChange={(e) => changeStatus.mutate({ id: record.maintenanceId, status: e.target.value })}
                        >
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </Select>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        <Card>
          <div className="border-b border-ink-100 px-4 py-3"><h2 className="text-[14px] font-semibold text-ink-900">Service watchlist</h2></div>
          <div className="divide-y divide-ink-50">
            {due?.data.map((truck) => (
              <div key={truck.truckId} className="flex items-center justify-between px-4 py-2.5">
                <div><p className="text-[13px] font-medium text-ink-800">Unit {truck.unitNumber}</p><p className="text-[10.5px] text-ink-400">{truck.homeTerminal} · {truck.status}</p></div>
                <div className="text-right"><p className="text-[11px] text-ink-500">{truck.nextServiceDue ? `Due ${date(truck.nextServiceDue)}` : `${truck.openRecords} open`}</p><Badge status={String(truck.status).toUpperCase()} /></div>
              </div>
            ))}
            {!due?.data.length ? <p className="px-4 py-8 text-center text-[12px] text-ink-400">All clear.</p> : null}
          </div>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule maintenance"
        description="Create a service record. Completing it returns the tractor to active duty."
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create record</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tractor"><Select value={values.truckId} onChange={(e) => setValues((v) => ({ ...v, truckId: e.target.value }))}><option value="">Select tractor…</option>{trucks?.data.map((t) => <option key={t.truckId} value={t.truckId}>Unit {t.unitNumber} · {t.make}</option>)}</Select></Field>
          <Field label="Service type"><Select value={values.maintenanceType} onChange={(e) => setValues((v) => ({ ...v, maintenanceType: e.target.value }))}>{["Preventive", "Repair", "Inspection", "Tire", "Brake", "Engine", "Transmission"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" value={values.maintenanceDate} onChange={(e) => setValues((v) => ({ ...v, maintenanceDate: e.target.value }))} /></Field>
          <Field label="Odometer"><Input type="number" value={values.odometerReading} onChange={(e) => setValues((v) => ({ ...v, odometerReading: e.target.value }))} /></Field>
          <Field label="Labour cost"><Input type="number" value={values.laborCost} onChange={(e) => setValues((v) => ({ ...v, laborCost: e.target.value }))} /></Field>
          <Field label="Parts cost"><Input type="number" value={values.partsCost} onChange={(e) => setValues((v) => ({ ...v, partsCost: e.target.value }))} /></Field>
          <Field label="Downtime hours"><Input type="number" value={values.downtimeHours} onChange={(e) => setValues((v) => ({ ...v, downtimeHours: e.target.value }))} /></Field>
          <Field label="Facility"><Input value={values.facilityLocation} onChange={(e) => setValues((v) => ({ ...v, facilityLocation: e.target.value }))} /></Field>
          <Field label="Status" className="sm:col-span-2"><Select value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}><option value="SCHEDULED">Scheduled</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></Select></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={values.serviceDescription} onChange={(e) => setValues((v) => ({ ...v, serviceDescription: e.target.value }))} placeholder="Scope of work…" /></Field>
        </div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      </Modal>
    </>
  );
}
