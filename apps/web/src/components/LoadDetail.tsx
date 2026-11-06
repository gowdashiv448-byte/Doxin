import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, ExternalLink, Fuel, MapPin, Package, Plus, TriangleAlert, User, X, Download, FileText, Mail, Send, Receipt, Eye } from "lucide-react";
import { LOAD_ACTIONS, type LoadAction } from "@doxin/shared";
import { api, ApiError } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useLanguage } from "../lib/language";
import { Badge, Button, Card, Drawer, Field, Input, Select, Textarea } from "./ui";
import { PdfViewerModal } from "./PdfViewerModal";
import { date, dateTime, money, num, titleCase } from "../lib/format";

type Row = Record<string, any>;
interface Page<T> { data: T[] }

const STEPS = ["BOOKED", "PLANNED", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "COMPLETED"];

export function LoadDetail({ loadId, onClose }: { loadId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const editable = canWrite(user?.role, "dispatch");
  const [assignOpen, setAssignOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [viewingPdf, setViewingPdf] = useState<{
    open: boolean;
    endpoint?: string;
    title?: string;
    filename?: string;
  } | null>(null);

  const generateBillMutation = useMutation({
    mutationFn: () => api.post(`/api/accounting/bills/generate/${loadId}`),
    onSuccess: () => {
      toast.success("Invoice generated and emailed to customer");
      queryClient.invalidateQueries({ queryKey: ["load", loadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate invoice");
    },
  });

  const resendEmailMutation = useMutation({
    mutationFn: (billId: string) => api.post(`/api/accounting/bills/${billId}/resend-email`),
    onSuccess: () => {
      toast.success("Invoice receipt email sent successfully");
      queryClient.invalidateQueries({ queryKey: ["load", loadId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to resend email");
    },
  });

  const { data: load, isLoading } = useQuery({
    queryKey: ["load", loadId],
    queryFn: () => api.get<Row>(`/api/loads/${loadId}`),
  });
  const { data: drivers } = useQuery({
    queryKey: ["drivers", "assign-options", loadId],
    queryFn: () => api.get<Page<Row>>("/api/drivers", { pageSize: 200, available: "true", forLoadId: loadId }),
  });
  const { data: trucks } = useQuery({
    queryKey: ["trucks", "assign-options", loadId],
    queryFn: () => api.get<Page<Row>>("/api/trucks", { pageSize: 200, available: "true", forLoadId: loadId }),
  });
  const { data: trailers } = useQuery({
    queryKey: ["trailers", "assign-options", loadId],
    queryFn: () => api.get<Page<Row>>("/api/trailers", { pageSize: 200, available: "true", forLoadId: loadId }),
  });
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
    void queryClient.invalidateQueries({ queryKey: ["drivers"] });
    void queryClient.invalidateQueries({ queryKey: ["trucks"] });
    void queryClient.invalidateQueries({ queryKey: ["trailers"] });
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
    <>
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
                  {exception ? <span className="badge bg-red-50 text-red-700 ring-1 ring-inset ring-red-100"><TriangleAlert className="h-3 w-3" /> {t("Needs attention")}</span> : null}
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
                      {t(titleCase(step))}
                    </span>
                    {index < STEPS.length - 1 ? <span className={`h-px w-2 ${done ? "bg-ink-300" : "bg-ink-100"}`} /> : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {available.map(([name, rule]) => {
                if (name === "plan") {
                  return <Button key={name} variant="primary" size="sm" onClick={() => setAssignOpen(true)} disabled={!editable}>{load.tripId ? t("Change Truck & Driver") : t("Assign Truck & Driver")}</Button>;
                }
                if (name === "flag_exception") {
                  return <Button key={name} variant="danger" size="sm" onClick={() => setExceptionOpen(true)} disabled={!editable}>{t("Report Issue")}</Button>;
                }
                if (name === "cancel") {
                  return <Button key={name} variant="ghost" size="sm" disabled={!editable} onClick={() => { if (window.confirm("Cancel this trip? This cannot be undone.")) run("cancel"); }}>{t("Cancel")}</Button>;
                }
                if (name === "complete") {
                  return <Button key={name} variant="primary" size="sm" disabled={!editable} onClick={() => { if (window.confirm("Mark this trip as completed and generate bill?")) run("complete"); }}>{t("Complete Trip")}</Button>;
                }
                return <Button key={name} variant={name === "dispatch" ? "accent" : "primary"} size="sm" disabled={!editable} onClick={() => run(name as LoadAction)}>{t(rule.label)}</Button>;
              })}
              <Button variant="secondary" size="sm" onClick={() => setEventOpen(true)} disabled={!editable}>
                <MapPin className="h-3.5 w-3.5" /> {t("Record stop")}
              </Button>
            </div>
            {error ? <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[12px] text-red-700">{error}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-px border-b border-ink-100 bg-ink-100 sm:grid-cols-4">
              {[
                { label: t("Total Revenue"), value: money(totalRevenue, 2) },
                { label: t("Fuel Cost"), value: money(fuelCost, 2) },
                { label: t("Profit"), value: money(margin, 2) },
                { label: t("Distance"), value: `${num(load.actualDistanceMiles ?? load.typicalDistanceMiles)} km` },
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
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Package className="h-4 w-4 text-ink-400" /> {t("Trip Details")}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                    {[
                      [t("Pickup Date"), date(load.loadDate)],
                      [t("Target Delivery"), date(load.targetDeliveryDate)],
                      [t("Vehicle Type"), load.loadType],
                      [t("Booking Type"), load.bookingType],
                      [t("Weight"), load.weightLbs ? `${num(load.weightLbs)} kg` : "—"],
                      [t("Pieces / Boxes"), load.pieces ? num(load.pieces) : "—"],
                      [t("Freight Amount"), money(load.revenue, 2)],
                      [t("Fuel Extra"), money(load.fuelSurcharge, 2)],
                      [t("Other Charges"), money(load.accessorialCharges, 2)],
                      [t("PO / Bilty No."), load.poNumber || "—"],
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
                    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Clock className="h-4 w-4 text-ink-400" /> {t("Delivery events")}</h3>
                    <button onClick={() => setEventOpen(true)} disabled={!editable} className="text-[11px] font-medium text-signal-600 hover:text-signal-700">+ {t("Add event")}</button>
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
                {load.bill ? (
                  <Card className="border-emerald-200/80 bg-emerald-50/15 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                        <Receipt className="h-4 w-4 text-emerald-600" /> Tax Invoice
                      </h3>
                      <Badge tone="success">{load.bill.billId}</Badge>
                    </div>

                    <dl className="mt-3 space-y-2 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-ink-500">Dispatcher</dt>
                        <dd className="font-medium text-ink-800">{load.bill.dispatcherCompanyName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-ink-500">Customer Email</dt>
                        <dd className="font-medium text-ink-800">{load.bill.recipientEmail || "None on file"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-ink-500">Subtotal</dt>
                        <dd className="font-mono text-ink-800">{money(load.bill.subtotal, 2)}</dd>
                      </div>
                      <div className="flex justify-between font-semibold text-amber-800">
                        <dt>GST (18%)</dt>
                        <dd className="font-mono">+{money(load.bill.gstAmount, 2)}</dd>
                      </div>
                      <div className="flex justify-between border-t border-ink-200/60 pt-2 font-bold text-ink-900">
                        <dt>Total Due</dt>
                        <dd className="font-mono text-[13px] text-signal-700">{money(load.bill.totalAmount, 2)}</dd>
                      </div>
                    </dl>

                    {/* Invoice Download & Customer Email Status */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
                      <div className="flex items-center gap-1.5 text-[11.5px]">
                        <Mail className="h-3.5 w-3.5 text-ink-400" />
                        <span className="text-ink-500">Receipt:</span>
                        <Badge tone={load.bill.emailStatus === "SENT" ? "success" : load.bill.emailStatus === "FAILED" ? "danger" : "neutral"}>
                          {load.bill.emailStatus === "SENT" ? "Sent to customer" : load.bill.emailStatus === "FAILED" ? "Failed to send" : "Not sent"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            setViewingPdf({
                              open: true,
                              endpoint: `/api/accounting/bills/${load.bill.billId}/pdf`,
                              title: `Invoice ${load.bill.billId} · ${load.customerName}`,
                              filename: `Invoice-${load.bill.billId}.pdf`,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px]"
                          title="View invoice PDF in browser"
                        >
                          <Eye className="h-3.5 w-3.5" /> {t("View PDF")}
                        </Button>
                        <a
                          href={api.getAuthenticatedUrl(`/api/accounting/bills/${load.bill.billId}/pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary btn-sm inline-flex items-center gap-1 text-[11px]"
                        >
                          <Download className="h-3 w-3" /> {t("Download PDF")}
                        </a>
                        {load.bill.recipientEmail ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={resendEmailMutation.isPending}
                            onClick={() => resendEmailMutation.mutate(load.bill.billId)}
                            title="Resend invoice email to customer"
                            className="text-[11px]"
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ) : (load.loadStatus === "DELIVERED" || load.loadStatus === "COMPLETED") ? (
                  <Card className="border-dashed border-ink-300 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-[13px] font-semibold text-ink-900">{t("delivered")}</h4>
                        <p className="text-[11px] text-ink-500">Create invoice with itemized charges and 18% GST</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setViewingPdf({
                              open: true,
                              endpoint: `/api/accounting/bills/preview/${load.loadId}/pdf`,
                              title: `Invoice Preview · ${load.loadId}`,
                              filename: `Invoice-Preview-${load.loadId}.pdf`,
                            })
                          }
                        >
                          <Eye className="h-3.5 w-3.5" /> {t("View PDF")}
                        </Button>
                        <Button
                          variant="accent"
                          size="sm"
                          loading={generateBillMutation.isPending}
                          onClick={() => generateBillMutation.mutate()}
                        >
                          <FileText className="h-3.5 w-3.5" /> {t("Generate bill")}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card className="border-dashed border-ink-200 bg-ink-50/30 p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[12.5px] font-medium text-ink-800">Tax Invoice (Pending Delivery)</p>
                        <p className="text-[11px] text-ink-500">Preview draft invoice with calculated 18% GST</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setViewingPdf({
                            open: true,
                            endpoint: `/api/accounting/bills/preview/${load.loadId}/pdf`,
                            title: `Draft Invoice Preview · ${load.loadId}`,
                            filename: `Draft-Invoice-${load.loadId}.pdf`,
                          })
                        }
                        className="text-[11px]"
                      >
                        <Eye className="h-3.5 w-3.5" /> {t("View PDF")}
                      </Button>
                    </div>
                  </Card>
                )}

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
                      {load.tripId ? t("Change Truck & Driver") : t("Assign Truck & Driver")}
                    </Button>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900"><Fuel className="h-4 w-4 text-ink-400" /> {t("Fuel expenses")}</h3>
                  {load.fuelPurchases?.length ? (
                    <div className="space-y-2">
                      {load.fuelPurchases.slice(0, 5).map((fuel: Row) => (
                        <div key={fuel.fuelPurchaseId} className="flex items-center justify-between text-[12px]">
                          <span className="text-ink-600">{date(fuel.purchaseDate)} · {fuel.gallons} gal</span>
                          <span className="font-mono text-ink-800">{money(fuel.totalCost, 2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-ink-400">{t("No fuel receipts linked.")}</p>}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 text-[13px] font-semibold text-ink-900">{t("recent trips")}</h3>
                  <div className="space-y-2">
                    {load.timeline?.length ? load.timeline.slice(0, 6).map((item: Row) => (
                      <div key={item.id} className="text-[11.5px]">
                        <p className="font-medium text-ink-700">{t(titleCase(item.action))}</p>
                        <p className="text-ink-400">{item.actorName} · {dateTime(item.createdAt)}</p>
                      </div>
                    )) : <p className="text-[12px] text-ink-400">{t("No activity yet.")}</p>}
                  </div>
                </Card>
              </div>
            </div>
            <p className="px-5 pb-5 text-[10.5px] text-ink-400">{t("* Estimated contribution margin = revenue − fuel cost. Driver pay, tolls and allocated maintenance are not included.")}</p>
          </div>

          {assignOpen ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-ink-950/35" onClick={() => setAssignOpen(false)} />
              <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lift animate-rise">
                <h3 className="text-[15px] font-semibold text-ink-900">{load.tripId ? t("Change Truck & Driver") : t("Assign Truck & Driver")}</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">{t("Only free and available resources not on active trips are shown.")}</p>
                <div className="mt-4 space-y-3">
                  <Field label={t("Driver")}>
                    <Select value={assignment.driverId} onChange={(e) => setAssignment((a) => ({ ...a, driverId: e.target.value }))}>
                      <option value="">{t("Select driver…")}</option>
                      {assignment.driverId && !drivers?.data?.some((d) => d.driverId === assignment.driverId) && (
                        <option value={assignment.driverId}>
                          {load.trip?.driverName || load.driverName || assignment.driverId} ({t("Current")})
                        </option>
                      )}
                      {drivers?.data?.map((d) => (
                        <option key={d.driverId} value={d.driverId}>
                          {d.firstName} {d.lastName} · {d.homeTerminal}{d.driverId === (load.trip?.driverId ?? load.driverId) ? ` (${t("Current")})` : ""}
                        </option>
                      ))}
                      {!drivers?.data?.length && !assignment.driverId && <option value="" disabled>{t("No free drivers available (all on duty)")}</option>}
                    </Select>
                  </Field>
                  <Field label={t("Truck")}>
                    <Select value={assignment.truckId} onChange={(e) => setAssignment((a) => ({ ...a, truckId: e.target.value }))}>
                      <option value="">{t("Select truck…")}</option>
                      {assignment.truckId && !trucks?.data?.some((t) => t.truckId === assignment.truckId) && (
                        <option value={assignment.truckId}>
                          Unit {load.trip?.truckUnit || load.truckUnit || assignment.truckId} ({t("Current")})
                        </option>
                      )}
                      {trucks?.data?.map((trk) => (
                        <option key={trk.truckId} value={trk.truckId}>
                          Unit {trk.unitNumber} · {trk.make} {trk.modelYear}{trk.truckId === (load.trip?.truckId ?? load.truckId) ? ` (${t("Current")})` : ""}
                        </option>
                      ))}
                      {!trucks?.data?.length && !assignment.truckId && <option value="" disabled>{t("No free trucks available (all on trips)")}</option>}
                    </Select>
                  </Field>
                  <Field label={t("Trailer")}>
                    <Select value={assignment.trailerId} onChange={(e) => setAssignment((a) => ({ ...a, trailerId: e.target.value }))}>
                      <option value="">{t("Select trailer…")}</option>
                      {assignment.trailerId && !trailers?.data?.some((d) => d.trailerId === assignment.trailerId) && (
                        <option value={assignment.trailerId}>
                          {load.trip?.trailerNumber || load.trailerNumber || assignment.trailerId} ({t("Current")})
                        </option>
                      )}
                      {trailers?.data?.map((trl) => (
                        <option key={trl.trailerId} value={trl.trailerId}>
                          {trl.trailerNumber} · {trl.trailerType}{trl.trailerId === (load.trip?.trailerId ?? load.trailerId) ? ` (${t("Current")})` : ""}
                        </option>
                      ))}
                      {!trailers?.data?.length && !assignment.trailerId && <option value="" disabled>{t("No free trailers available (all on trips)")}</option>}
                    </Select>
                  </Field>
                </div>
                {error ? <p className="mt-2 text-[12px] text-red-700">{t(error)}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAssignOpen(false)}>{t("Cancel")}</Button>
                  <Button
                    variant="primary"
                    loading={action.isPending}
                    onClick={() => {
                      if (!assignment.driverId || !assignment.truckId || !assignment.trailerId) {
                        setError(t("Select a driver, truck and trailer"));
                        return;
                      }
                      run("plan", assignment);
                    }}
                  >
                    {t("Save assignment")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {exceptionOpen ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-ink-950/35" onClick={() => setExceptionOpen(false)} />
              <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lift animate-rise">
                <h3 className="text-[15px] font-semibold text-ink-900">{t("Report an Issue")}</h3>
                <p className="mt-0.5 text-[12px] text-ink-500">{t("Flags this trip with a delay or problem for dispatch attention.")}</p>
                <div className="mt-3">
                  <Field label={t("Issue details")}>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Truck breakdown near Pune. Delay approx 2 hours." />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setExceptionOpen(false)}>{t("Cancel")}</Button>
                  <Button variant="danger" loading={action.isPending} onClick={() => run("flag_exception", { reason })}>{t("Submit Issue")}</Button>
                </div>
              </div>
            </div>
          ) : null}

          {eventOpen ? <EventModal load={load} facilities={facilities?.data ?? []} onClose={() => setEventOpen(false)} onSave={(payload) => event.mutate(payload)} loading={event.isPending} error={error} /> : null}
        </>
      )}
    </Drawer>

    <PdfViewerModal
      open={Boolean(viewingPdf?.open)}
      onClose={() => setViewingPdf(null)}
      pdfEndpoint={viewingPdf?.endpoint}
      title={viewingPdf?.title}
      filename={viewingPdf?.filename}
    />
  </>
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
  const { t } = useLanguage();
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
        <h3 className="text-[15px] font-semibold text-ink-900">{t("Record delivery event")}</h3>
        <p className="mt-0.5 text-[12px] text-ink-500">{load.loadId} · {load.customerName}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t("Event type")}>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value as "Pickup" | "Delivery")}>
              <option value="Pickup">{t("Pickup")}</option>
              <option value="Delivery">{t("Delivery")}</option>
            </Select>
          </Field>
          <Field label={t("Facility")}>
            <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">{t("No facility")}</option>
              {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.facilityName}</option>)}
            </Select>
          </Field>
          <Field label={t("Scheduled")}>
            <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label={t("Actual")}>
            <Input type="datetime-local" value={actual} onChange={(e) => setActual(e.target.value)} />
          </Field>
          <Field label={t("Detention (min)")}>
            <Input type="number" min={0} value={detention} onChange={(e) => setDetention(e.target.value)} />
          </Field>
          <Field label={t("Notes")} className="sm:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Optional")} />
          </Field>
        </div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{t(error)}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
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
            {t("Save event")}
          </Button>
        </div>
      </div>
    </div>
  );
}
