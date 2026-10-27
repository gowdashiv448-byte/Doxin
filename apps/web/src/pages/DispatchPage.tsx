import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, CircleDollarSign, Send, Truck, Users } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader, StatCard } from "../components/ui";
import { LoadDetail } from "../components/LoadDetail";
import { money, num, relative } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;

const columns = [
  { status: "BOOKED", label: "Booked · needs planning", tone: "border-t-sky-400" },
  { status: "PLANNED", label: "Planned · ready to dispatch", tone: "border-t-indigo-400" },
  { status: "DISPATCHED", label: "Dispatched", tone: "border-t-amber-400" },
  { status: "IN_TRANSIT", label: "In transit", tone: "border-t-emerald-400" },
  { status: "EXCEPTION", label: "Exceptions", tone: "border-t-red-400" },
];

export default function DispatchPage() {
  const [params, setParams] = useSearchParams();
  const {
    data,
    isLoading,
  } = useQuery({
    queryKey: ["loads", "dispatch"],
    queryFn: () => api.get<Page<Row>>("/api/loads", { status: "ACTIVE", pageSize: 100, sort: "loadDate", order: "asc" }),
    refetchInterval: 45_000,
  });
  const { data: drivers } = useQuery({ queryKey: ["drivers", "dispatch"], queryFn: () => api.get<Page<Row>>("/api/drivers", { pageSize: 200, employmentStatus: "Active" }) });
  const { data: trucks } = useQuery({ queryKey: ["trucks", "dispatch"], queryFn: () => api.get<Page<Row>>("/api/trucks", { pageSize: 200, status: "Active" }) });
  const { data: trailers } = useQuery({ queryKey: ["trailers", "dispatch"], queryFn: () => api.get<Page<Row>>("/api/trailers", { pageSize: 200, status: "Active" }) });

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const column of columns) map.set(column.status, []);
    for (const load of data?.data ?? []) {
      const key = load.loadStatus === "EXCEPTION" ? "EXCEPTION" : load.loadStatus;
      if (map.has(key)) map.get(key)!.push(load);
    }
    return map;
  }, [data]);

  const openId = params.get("open");
  const openLoad = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("open", id);
    setParams(next);
  };
  const closeLoad = () => {
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next);
  };

  const unassigned = data?.data.filter((l) => !l.tripId).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Dispatch"
        title="Dispatch board"
        description="Move loads from booked to rolling. Assign a driver, tractor and trailer, then dispatch."
        actions={<div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[12px] text-ink-500"><Send className="h-3.5 w-3.5 text-signal-500" /> Live board · refreshes every 45s</div>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unassigned loads" value={num(unassigned)} sub="Need driver & equipment" tone={unassigned ? "warning" : "neutral"} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Available drivers" value={num(drivers?.data.filter((d) => d.employmentStatus === "Active").length ?? 0)} sub="Eligible to dispatch" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Available tractors" value={num(trucks?.data.length ?? 0)} sub="Active power units" icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Board revenue" value={money((data?.data ?? []).reduce((sum, load) => sum + Number(load.totalRevenue ?? 0), 0))} sub={`${data?.data.length ?? 0} loads on the board`} icon={<CircleDollarSign className="h-4 w-4" />} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
        <span className="font-medium text-ink-700">Resource pool</span>
        <span className="rounded-full border border-ink-200 bg-white px-2 py-0.5">{trailers?.data.length ?? 0} trailers</span>
        <span className="rounded-full border border-ink-200 bg-white px-2 py-0.5">{drivers?.data.filter((d) => d.employmentStatus === "Active").length ?? 0} drivers</span>
        <span className="rounded-full border border-ink-200 bg-white px-2 py-0.5">Open a load to assign</span>
      </div>

      {isLoading ? <Card className="mt-4"><LoadingBlock rows={8} /></Card> : (
        <div className="mt-4 grid gap-3 overflow-x-auto pb-4 xl:grid-cols-5">
          {columns.map((column) => {
            const loads = grouped.get(column.status) ?? [];
            return (
              <div key={column.status} className={`min-w-[260px] rounded-xl border border-ink-100 border-t-2 bg-white/60 ${column.tone}`}>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600">{column.label}</p>
                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500 ring-1 ring-ink-100">{loads.length}</span>
                </div>
                <div className="space-y-2 px-2 pb-3">
                  {loads.length ? loads.map((load) => (
                    <button key={load.loadId} onClick={() => openLoad(load.loadId)} className="w-full rounded-lg border border-ink-100 bg-white p-3 text-left shadow-card transition-all hover:-translate-y-px hover:border-ink-200 hover:shadow-lift">
                      <div className="flex items-start justify-between gap-2">
                        <span className="mono text-[11px] font-medium text-ink-900">{load.loadId}</span>
                        <span className="font-mono text-[11px] text-ink-500">{money(load.totalRevenue)}</span>
                      </div>
                      <p className="mt-1.5 truncate text-[12.5px] font-medium text-ink-800">{load.customerName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-500">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</p>
                      <div className="mt-2 flex items-center justify-between border-t border-ink-50 pt-2">
                        {load.driverName ? (
                          <span className="truncate text-[10.5px] text-ink-600">{load.driverName} · {load.truckUnit}</span>
                        ) : (
                          <span className="text-[10.5px] font-medium text-signal-600">Needs assignment</span>
                        )}
                        <span className="text-[10px] text-ink-400">{relative(load.createdAt)}</span>
                      </div>
                      {load.loadStatus === "EXCEPTION" ? (
                        <p className="mt-2 line-clamp-2 rounded bg-red-50 px-2 py-1 text-[10px] leading-4 text-red-700">{load.exceptionReason}</p>
                      ) : null}
                    </button>
                  )) : (
                    <div className="rounded-lg border border-dashed border-ink-200 px-3 py-8 text-center text-[11px] text-ink-400">Nothing here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !data?.data.length ? <Card><EmptyState title="The board is clear" description="There are no active loads. Book a load to start dispatching." icon={<ArrowRight className="h-5 w-5" />} /></Card> : null}
      {openId ? <LoadDetail loadId={openId} onClose={closeLoad} /> : null}
    </>
  );
}
