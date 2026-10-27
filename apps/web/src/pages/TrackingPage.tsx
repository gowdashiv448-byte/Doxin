import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Clock3, MapPin, PackageCheck, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Card, DataTable, EmptyState, LoadingBlock, PageHeader, Pagination, SearchInput, Select, StatCard } from "../components/ui";
import { LoadDetail } from "../components/LoadDetail";
import { dateTime, num, pct } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;

export default function TrackingPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [onTime, setOnTime] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["events", { search, type, onTime, page }],
    queryFn: () =>
      api.get<Page<Row> & { stats: { onTime: number; late: number; avgDetention: string } }>("/api/events", {
        search: search || undefined,
        type: type === "ALL" ? undefined : type,
        onTime: onTime || undefined,
        page,
        pageSize: 25,
      }),
    placeholderData: (prev) => prev,
  });

  const stats = data?.stats;
  const totalEvents = Number(stats?.onTime ?? 0) + Number(stats?.late ?? 0);
  const openId = params.get("open");
  const closeLoad = () => { const next = new URLSearchParams(params); next.delete("open"); setParams(next); };

  return (
    <>
      <PageHeader eyebrow="Execution" title="Tracking" description="Pickup and delivery proof across the network, with on-time performance and detention." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events tracked" value={num(totalEvents)} sub="Matching current filters" icon={<MapPin className="h-4 w-4" />} />
        <StatCard label="On-time" value={pct(totalEvents ? (Number(stats?.onTime ?? 0) / totalEvents) * 100 : 0)} sub={`${stats?.onTime ?? 0} events`} tone="positive" icon={<PackageCheck className="h-4 w-4" />} />
        <StatCard label="Late" value={num(stats?.late ?? 0)} sub="Missed service window" tone={Number(stats?.late) ? "negative" : "neutral"} icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Avg detention" value={`${num(stats?.avgDetention, 0)} min`} sub="Dwell at facility" icon={<Clock3 className="h-4 w-4" />} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Load, event, customer, city…" />
          <div className="flex items-center gap-2">
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-36"><option value="ALL">All events</option><option value="Pickup">Pickups</option><option value="Delivery">Deliveries</option></Select>
            <Select value={onTime} onChange={(e) => { setOnTime(e.target.value); setPage(1); }} className="w-36"><option value="">All timings</option><option value="true">On time</option><option value="false">Late</option></Select>
          </div>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead><tr><th>Event</th><th>Load / customer</th><th>Type</th><th>Facility</th><th>Scheduled</th><th>Actual</th><th>Detention</th><th>Timing</th></tr></thead>
              <tbody>
                {data.data.map((event) => (
                  <tr key={event.eventId} className="cursor-pointer" onClick={() => { const next = new URLSearchParams(params); next.set("open", event.loadId); setParams(next); }}>
                    <td className="mono text-[11px]">{event.eventId}</td>
                    <td><p className="mono text-[11.5px] font-medium text-ink-900">{event.loadId}</p><p className="max-w-[160px] truncate text-[11px] text-ink-500">{event.customerName}</p></td>
                    <td><Badge tone={event.eventType === "Delivery" ? "success" : "info"}>{event.eventType}</Badge></td>
                    <td><p className="text-[12.5px]">{event.facilityName ?? "—"}</p><p className="text-[10.5px] text-ink-400">{event.locationCity}, {event.locationState}</p></td>
                    <td className="text-[12px] text-ink-600">{dateTime(event.scheduledDatetime)}</td>
                    <td className="text-[12px] text-ink-600">{dateTime(event.actualDatetime)}</td>
                    <td className="font-mono text-[12px]">{event.detentionMinutes ? `${event.detentionMinutes} min` : "—"}</td>
                    <td>{event.onTimeFlag === null ? <Badge tone="neutral">Pending</Badge> : <Badge tone={event.onTimeFlag ? "success" : "danger"}>{event.onTimeFlag ? "On time" : "Late"}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : <EmptyState title="No events found" description="Delivery events appear when pickups and deliveries are recorded." />}
      </Card>
      {openId ? <LoadDetail loadId={openId} onClose={closeLoad} /> : null}
    </>
  );
}
