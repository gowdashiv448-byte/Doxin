import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, ExternalLink, Fuel, MapPin, Package, Plus, TriangleAlert, User, X } from "lucide-react";
import { LOAD_ACTIONS, type LoadAction } from "@doxin/shared";
import { api, ApiError } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, Drawer, Field, Input, Select, Textarea } from "./ui";
import { date, dateTime, money, num, titleCase } from "../lib/format";

type Row = Record<string, any>;
interface Page<T> { data: T[] }

const STEPS = ["BOOKED", "PLANNED", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "COMPLETED"];

export function LoadDetail({ loadId, onClose }: { loadId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const editable = canWrite(user?.role, "dispatch");
  const [assignOpen, setAssignOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const { data: load, isLoading } = useQuery({
    queryKey: ["load", loadId],
    queryFn: () => api.get<Row>(`/api/loads/${loadId}`),
  });
  const { data: drivers } = useQuery({ queryKey: ["drivers", "options"], queryFn: () => api.get<Page<Row>>("/api/drivers", { pageSize: 200, employmentStatus: "Active" }) });
  const { data: trucks } = useQuery({ queryKey: ["trucks", "options"], queryFn: () => api.get<Page<Row>>("/api/trucks", { pageSize: 200 }) });
  const { data: trailers } = useQuery({ queryKey: ["trailers", "options"], queryFn: () => api.get<Page<Row>>("/api/trailers", { pageSize: 200 }) });
  const { data: facilities } = useQuery({ queryKey: ["facilities", "options"], queryFn: () => api.get<Page<Row>>("/api/facilities", { pageSize: 100 }) });

  const [assignment, setAssignment] = useState({ driverId: "", truckId: "", trailerId: "" });
  useEffect(() => {
    if (load) {
      setAssignment({
        driverId: String(load.trip?.driverId ?? load.driverId ?? ""),
        truckId: String(load.trip?.truckId ?? load.truckId ?? ""),
        trailerId: String(load.trip?.trailerId ?? load.trailerId ?? ""),
      });
    }
  }, [load]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["load", loadId] });
    void queryClient.invalidateQueries({ queryKey: ["loads"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["trips"] });
  };

  const action = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<Row>(`/api/loads/${loadId}/actions`, payload),
    onSuccess: (_data, payload) => {
      toast.success(`Load ${String(payload.action).replaceAll("_", " ")} completed`);
      setAssignOpen(false);
      setExceptionOpen(false);
      setReason("");
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Action failed"),
  });

  const event = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`/api/loads/${loadId}/events`, payload),
    onSuccess: () => {
      toast.success("Delivery event recorded");
      setEventOpen(false);
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not record event"),
  });

  const run = (actionName: LoadAction, extra: Record<string, unknown> = {}) => {
    setError("");
    action.mutate({ action: actionName, ...extra });
  };

  const available = useMemo(
    () => (load ? Object.entries(LOAD_ACTIONS).filter(([, rule]) => rule.from.includes(load.loadStatus as never)) : []),
    [load],
  );

  const totalRevenue = Number(load?.totalRevenue ?? 0);
  const fuelCost = Number(load?.fuelCost ?? 0);
  const margin = totalRevenue - fuelCost;
  const stepIndex = load ? STEPS.indexOf(load.loadStatus) : -1;
  const exception = load?.loadStatus === "EXCEPTION";

  return (
    <Drawer open onClose={onClose} width="max-w-[760px]">
      {isLoading || !load ? (
        <div className="p-6"><div className="skeleton h-8 w-48" /><div className="skeleton mt-4 h-32 w-full" /></div>
      ) : (
        <>
          <div className="border-b border-ink-100 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="mono text-[13px] font-medium text-ink-500">{load.loadId}</span>
                  <Badge status={load.loadStatus} />
                  {exception ? <span className="badge bg-red-50 text-red-700 ring-1 ring-inset ring-red-100"><TriangleAlert className="h-3 w-3" /> Needs attention</span> : null}
                </div>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink-900">{load.customerName}</h2>
                <p className="mt-0.5 text-[13px] text-ink-500">
                  {load.originCity}, {load.originState} <span className="mx-1 text-ink-300">→</span> {load.destinationCity}, {load.destinationState}
                </p>
              </div>
              <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Close panel">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {STEPS.map((step, index) => {
                const done = !exception && index <= stepIndex;
                return (
                  <div key={step} className="flex items-center gap-1.5">
                    <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium ${done ? "bg-ink-900 text-white" : "bg-ink-50 text-ink-400"}`}>
                      {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {titleCase(step)}
                    </span>
                    {index < STEPS.length - 1 ? <span className={`h-px w-2 ${done ? "bg-ink-300" : "bg-ink-100"}`} /> : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {available.map(([name, rule]) => {
                if (name === "plan") {
                  return <Button key={name} variant="primary" size="sm" onClick={() => setAssignOpen(true)} disabled={!editable}>{load.tripId ? "Update assignment" : "Assign resources"}</Button>;
                }
                if (name === "flag_exception") {
                  return <Button key={name} variant="danger" size="sm" onClick={() => setExceptionOpen(true)} disabled={!editable}>Flag exception</Button>;
                }
                if (name === "cancel") {
                  return <Button key={name} variant="ghost" size="sm" disabled={!editable} onClick={() => { if (window.confirm("Cancel this load? This cannot be undone.")) run("cancel"); }}>Cancel</Button>;
                }
                if (name === "complete") {
                  return <Button key={name} variant="primary" size="sm" disabled={!editable} onClick={() => { if (window.confirm("Close this load? Financials will be locked.")) run("complete"); }}>Close load</Button>;
                }
                return <Button key={name} variant={name === "dispatch" ? "accent" : "primary"} size="sm" disabled={!editable} onClick={() => run(name as LoadAction)}>{rule.label}</Button>;
              })}
              <Button variant="secondary" size="sm" onClick={() => setEventOpen(true)} disabled={!editable}>
                <MapPin className="h-3.5 w-3.5" /> Record event
              </Button>
            </div>
            {error ? <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[12px] text-red-700">{error}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-px border-b border-ink-100 bg-ink-100 sm:grid-cols-4">
              {[
                { label: "Total revenue", value: money(totalRevenue, 2) },
                { label: "Fuel cost", value: money(fuelCost, 2) },
                { label: "Margin*", value: money(margin, 2) },
                { label: "Distance", value: `${num(load.actualDistanceMiles ?? load.typicalDistanceMiles)} mi` },
              ].map((item) => (
                <div key={item.label} className="bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-400">{item.label}</p>
                  <p className="mt-1 font-mono text-[15px] font-medium text-ink-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-5">
              <div className="lg:col-span-3 space-y-4">
                <Card className="p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Package className="h-4 w-4 text-ink-400" /> Shipment</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                    {[
                      ["Load date", date(load.loadDate)],
                      ["Target delivery", date(load.targetDeliveryDate)],
                      ["Equipment", load.loadType],
                      ["Booking", load.bookingType],
                      ["Weight", load.weightLbs ? `${num(load.weightLbs)} lbs` : "—"],
                      ["Pieces", load.pieces ? num(load.pieces) : "—"],
                      ["Linehaul", money(load.revenue, 2)],
                      ["Fuel surcharge", money(load.fuelSurcharge, 2)],
                      ["Accessorials", money(load.accessorialCharges, 2)],
                      ["PO / reference", load.poNumber || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2">
                        <dt className="text-ink-500">{label}</dt>
                        <dd className="text-right font-medium text-ink-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {load.notes ? <p className="mt-3 rounded-md bg-ink-50 p-2.5 text-[12px] leading-5 text-ink-600">{load.notes}</p> : null}
                </Card>

                <Card className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Clock className="h-4 w-4 text-ink-400" /> Delivery events</h3>
                    <button onClick={() => setEventOpen(true)} disabled={!editable} className="text-[11px] font-medium text-signal-600 hover:text-signal-700">+ Add event</button>
                  </div>
                  {load.events.length ? (
                    <div className="space-y-3">
                      {load.events.map((ev: Row) => (
                        <div key={ev.eventId} className="flex gap-3">
                          <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ev.eventType === "Delivery" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
                            <MapPin className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1 border-b border-ink-50 pb-3 last:border-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[12.5px] font-medium text-ink-800">{ev.eventType} · {ev.locationCity ?? "—"}, {ev.locationState ?? ""}</p>
                              {ev.onTimeFlag !== null && ev.onTimeFlag !== undefined ? <Badge tone={ev.onTimeFlag ? "success" : "danger"}>{ev.onTimeFlag ? "On time" : "Late"}</Badge> : <Badge tone="neutral">Pending</Badge>}
                            </div>
                            <p className="mt-0.5 text-[11.5px] text-ink-500">
                              {ev.actualDatetime ? `Actual ${dateTime(ev.actualDatetime)}` : "Not yet completed"}
                              {ev.scheduledDatetime ? ` · scheduled ${dateTime(ev.scheduledDatetime)}` : ""}
                              {Number(ev.detentionMinutes) > 0 ? ` · ${ev.detentionMinutes} min detention` : ""}
                            </p>
                            {ev.facilityName ? <p className="text-[11px] text-ink-400">{ev.facilityName}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-ink-400">No events recorded yet.</p>}
                </Card>

                {load.incidents?.length ? (
                  <Card className="border-red-100 p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-red-800"><TriangleAlert className="h-4 w-4" /> Safety incidents</h3>
                    {load.incidents.map((incident: Row) => (
                      <div key={incident.incidentId} className="flex items-center justify-between py-1.5 text-[12px]">
                        <span>{incident.incidentType} · {date(incident.incidentDate)}</span>
                        <span className="font-mono">{money(incident.claimAmount, 2)}</span>
                      </div>
                    ))}
                  </Card>
                ) : null}
              </div>

              <div className="space-y-4 lg:col-span-2">
                <Card className="p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900"><User className="h-4 w-4 text-ink-400" /> Assignment</h3>
                  {load.tripId ? (
                    <dl className="space-y-2.5 text-[12px]">
                      {[
                        ["Driver", load.trip?.driverName ?? load.driverName],
                        ["Truck", load.trip?.truckUnit ?? load.truckUnit],
                        ["Trailer", load.trip?.trailerNumber ?? load.trailerId],
                        ["Trip", load.trip?.tripId ?? load.tripId],
                        ["Trip status", titleCase(load.trip?.tripStatus ?? load.tripStatus)],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between gap-2">
                          <dt className="text-ink-500">{label}</dt>
                          <dd className="font-medium text-ink-800">{value || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-[12px] text-ink-400">No driver or equipment assigned.</p>}
                  {(load.loadStatus === "BOOKED" || load.loadStatus === "PLANNED" || load.loadStatus === "EXCEPTION") && editable ? (
                    <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setAssignOpen(true)}>
                      {load.tripId ? "Change assignment" : "Assign driver & equipment"}
                    </Button>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Fuel className="h-4 w-4 text-ink-400" /> Fuel purchases</h3>
                  {load.fuelPurchases?.length ? (
                    <div className="space-y-2">
                      {load.fuelPurchases.slice(0, 5).map((fuel: Row) => (
                        <div key={fuel.fuelPurchaseId} className="flex items-center justify-between text-[12px]">
                          <span className="text-ink-600">{date(fuel.purchaseDate)} · {fuel.gallons} gal</span>
                          <span className="font-mono text-ink-800">{money(fuel.totalCost, 2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-ink-400">No fuel receipts linked.</p>}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 text-[13px] font-semibold text-ink-900">Activity</h3>
                  <div className="space-y-2">
                    {load.timeline?.length ? load.timeline.slice(0, 6).map((item: Row) => (
                      <div key={item.id} className="text-[11.5px]">
                        <p className="font-medium text-ink-700">{titleCase(item.action)}</p>
                        <p className="text-ink-400">{item.actorName} · {dateTime(item.createdAt)}</p>
                      </div>
                    )) : <p className="text-[12px] text-ink-400">No activity yet.</p>}
                  </div>
                </Card>
              </div>
            </div>
            <p className="px-5 pb-5 text-[10.5px] text-ink-400">* Estimated contribution margin = revenue − fuel cost. Driver pay, tolls and allocated maintenance are not included.</p>
          </div>

          {assignOpen ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-ink-950/35" onClick={() => setAssignOpen(false)} />
              <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lift animate-rise">
                <h3 className="text-[15px] font-semibold text-ink-900">Assign driver & equipment</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">Only active, available resources are shown.</p>
                <div className="mt-4 space-y-3">
                  <Field label="Driver">
                    <Select value={assignment.driverId} onChange={(e) => setAssignment((a) => ({ ...a, driverId: e.target.value }))}>
                      <option value="">Select driver…</option>
                      {drivers?.data.filter((d) => d.employmentStatus === "Active").map((d) => <option key={d.driverId} value={d.driverId}>{d.firstName} {d.lastName} · {d.homeTerminal}</option>)}
                    </Select>
                  </Field>
                  <Field label="Truck">
                    <Select value={assignment.truckId} onChange={(e) => setAssignment((a) => ({ ...a, truckId: e.target.value }))}>
                      <option value="">Select tractor…</option>
                      {trucks?.data.filter((t) => t.status === "Active").map((t) => <option key={t.truckId} value={t.truckId}>Unit {t.unitNumber} · {t.make} {t.modelYear}</option>)}
                    </Select>
                  </Field>
                  <Field label="Trailer">
                    <Select value={assignment.trailerId} onChange={(e) => setAssignment((a) => ({ ...a, trailerId: e.target.value }))}>
                      <option value="">Select trailer…</option>
                      {trailers?.data.filter((t) => t.status === "Active").map((t) => <option key={t.trailerId} value={t.trailerId}>{t.trailerNumber} · {t.trailerType}</option>)}
                    </Select>
                  </Field>
                </div>
                {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    loading={action.isPending}
                    onClick={() => {
                      if (!assignment.driverId || !assignment.truckId || !assignment.trailerId) {
                        setError("Select a driver, truck and trailer");
                        return;
                      }
                      run("plan", assignment);
                    }}
                  >
                    Save assignment
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {exceptionOpen ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-ink-950/35" onClick={() => setExceptionOpen(false)} />
              <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lift animate-rise">
                <h3 className="text-[15px] font-semibold text-ink-900">Flag this load</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">The load moves to the exception queue and appears on the control tower.</p>
                <div className="mt-3">
                  <Field label="What happened?">
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Driver reported a mechanical delay near Columbus. Recovery ETA 3 hours." />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setExceptionOpen(false)}>Cancel</Button>
                  <Button variant="danger" loading={action.isPending} onClick={() => run("flag_exception", { reason })}>Flag exception</Button>
                </div>
              </div>
            </div>
          ) : null}

          {eventOpen ? <EventModal load={load} facilities={facilities?.data ?? []} onClose={() => setEventOpen(false)} onSave={(payload) => event.mutate(payload)} loading={event.isPending} error={error} /> : null}
        </>
      )}
    </Drawer>
  );
}

function EventModal({
  load,
  facilities,
  onClose,
  onSave,
  loading,
  error,
}: {
  load: Row;
  facilities: Row[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  loading: boolean;
  error: string;
}) {
  const [eventType, setEventType] = useState<"Pickup" | "Delivery">("Delivery");
  const [facilityId, setFacilityId] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [actual, setActual] = useState(() => new Date().toISOString().slice(0, 16));
  const [detention, setDetention] = useState("0");
  const [notes, setNotes] = useState("");

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lift animate-rise">
        <h3 className="text-[15px] font-semibold text-ink-900">Record delivery event</h3>
        <p className="mt-0.5 text-[12px] text-ink-500">{load.loadId} · {load.customerName}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Event type">
            <Select value={eventType} onChange={(e) => setEventType(e.target.value as "Pickup" | "Delivery")}>
              <option>Pickup</option>
              <option>Delivery</option>
            </Select>
          </Field>
          <Field label="Facility">
            <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">No facility</option>
              {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.facilityName}</option>)}
            </Select>
          </Field>
          <Field label="Scheduled">
            <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label="Actual">
            <Input type="datetime-local" value={actual} onChange={(e) => setActual(e.target.value)} />
          </Field>
          <Field label="Detention (min)">
            <Input type="number" min={0} value={detention} onChange={(e) => setDetention(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() =>
              onSave({
                eventType,
                facilityId: facilityId || null,
                scheduledDatetime: scheduled ? new Date(scheduled).toISOString() : null,
                actualDatetime: actual ? new Date(actual).toISOString() : null,
                detentionMinutes: Number(detention || 0),
                notes: notes || undefined,
              })
            }
          >
            Save event
          </Button>
        </div>
      </div>
    </div>
  );
}
