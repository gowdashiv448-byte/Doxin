import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useLanguage } from "../lib/language";
import { Badge, Card, DataTable, EmptyState, LoadingBlock, PageHeader, Pagination, SearchInput, Select } from "../components/ui";
import { date, money, num, pct } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;

export default function TripsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ["trips", { search, status, page }],
    queryFn: () => api.get<Page<Row>>("/api/trips", { search: search || undefined, status: status === "ALL" ? undefined : status, page, pageSize: 25 }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Trips"
        description="Active and completed trips with driver, truck, KM, and fuel efficiency."
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Trip, load, customer, unit…" />
          <div className="flex items-center gap-2">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
              <option value="ALL">{t("all")} {t("status")}</option>
              <option value="PLANNED">{t("planned")}</option>
              <option value="DISPATCHED">{t("dispatched")}</option>
              <option value="IN_TRANSIT">{t("on the road")}</option>
              <option value="DELIVERED">{t("delivered")}</option>
              <option value="COMPLETED">{t("completed")}</option>
              <option value="CANCELLED">{t("cancelled")}</option>
            </Select>
            <span className="text-[11px] text-ink-400">{data?.total?.toLocaleString() ?? 0} {t("trips")}</span>
          </div>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead><tr><th>{t("Trip ID")}</th><th>{t("Customer")} / {t("Revenue")}</th><th>{t("Route")}</th><th>{t("Driver & Truck")}</th><th>{t("Dispatch")}</th><th className="text-right">KM</th><th className="text-right">km/L</th><th>{t("Status")}</th></tr></thead>
              <tbody>
                {data.data.map((trip) => (
                  <tr key={trip.tripId} className="cursor-pointer" onClick={() => navigate(`/loads?open=${trip.loadId}`)}>
                    <td><p className="mono text-[11.5px] font-medium text-ink-900">{trip.tripId}</p><p className="mono text-[10px] text-ink-400">{trip.loadId}</p></td>
                    <td><p className="max-w-[180px] truncate text-[13px]">{trip.customerName}</p><p className="font-mono text-[10.5px] text-ink-400">{money(Number(trip.revenue ?? 0) + Number(trip.fuelSurcharge ?? 0) + Number(trip.accessorialCharges ?? 0))}</p></td>
                    <td className="text-[12.5px]">{trip.originCity}, {trip.originState} → {trip.destinationCity}, {trip.destinationState}</td>
                    <td><p className="text-[12.5px]">{trip.driverName ?? "Unassigned"}</p><p className="mono text-[10.5px] text-ink-400">Unit {trip.truckUnit ?? "—"}</p></td>
                    <td className="text-[12px] text-ink-600">{date(trip.dispatchDate)}</td>
                    <td className="text-right font-mono text-[12px]">{num(trip.actualDistanceMiles)} km</td>
                    <td className="text-right font-mono text-[12px]">{trip.averageMpg ? Number(trip.averageMpg).toFixed(2) : "—"}</td>
                    <td><Badge status={trip.tripStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : <EmptyState title="No trips found" description="Trips appear here when you assign resources to a booking." />}
      </Card>
    </>
  );
}
