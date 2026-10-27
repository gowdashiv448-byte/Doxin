import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Download, Filter, Plus, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { canWrite, useAuth } from "../lib/auth";
import { Badge, Button, Card, DataTable, EmptyState, LoadingBlock, PageHeader, Pagination, SearchInput, Select, Tabs } from "../components/ui";
import { LoadDetail } from "../components/LoadDetail";
import { LoadForm } from "../components/LoadForm";
import { date, money, num } from "../lib/format";
import type { Page } from "@doxin/shared";

type Row = Record<string, any>;

const tabs = [
  { value: "ALL", label: "All loads" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXCEPTION", label: "Exceptions" },
  { value: "HISTORY", label: "History" },
];

export default function LoadsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const status = params.get("status") ?? "ACTIVE";
  const setStatus = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next === "ACTIVE") nextParams.delete("status");
    else nextParams.set("status", next);
    setParams(nextParams, { replace: true });
  };
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [newLoad, setNewLoad] = useState(false);
  const { user } = useAuth();
  const editable = canWrite(user?.role, "dispatch");

  const openId = params.get("open");
  useEffect(() => {
    if (editable && params.get("new")) {
      setNewLoad(true);
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [params, setParams, editable]);

  useEffect(() => {
    setPage(1);
  }, [search, status, customerId, from, to]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["loads", { search, status, customerId, from, to, page }],
    queryFn: () =>
      api.get<Page<Row>>("/api/loads", {
        search: search || undefined,
        status,
        customerId: customerId || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: 25,
      }),
    placeholderData: (prev) => prev,
  });
  const { data: customers } = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => api.get<Page<Row>>("/api/customers", { pageSize: 200, sort: "name", order: "asc" }),
  });

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

  const exportCsv = () => {
    if (!data?.data.length) return;
    const columns = ["loadId", "customerName", "originCity", "destinationCity", "loadDate", "loadStatus", "revenue", "fuelSurcharge", "accessorialCharges"];
    const rows = data.data.map((r) => columns.map((c) => `"${String(r[c] ?? "").replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[columns.join(","), ...rows].join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `doxin-loads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <>
      <PageHeader
        eyebrow="Core logistics"
        title="Loads"
        description="Quote, book and move every shipment. Open a load to assign resources and drive it through the workflow."
        actions={
          <>
            <Button variant="ghost" onClick={() => refetch()} loading={isFetching}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
            <Button variant="secondary" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export</Button>
            {editable ? <Button variant="accent" onClick={() => setNewLoad(true)}><Plus className="h-4 w-4" /> New load</Button> : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <Tabs value={status} onChange={setStatus} tabs={tabs} />
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Load, customer, lane, driver…" />
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-44">
              <option value="">All customers</option>
              {customers?.data.map((c) => <option key={c.customerId} value={c.customerId}>{c.customerName}</option>)}
            </Select>
            <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-1.5">
              <Filter className="h-3.5 w-3.5 text-ink-400" />
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 border-0 bg-transparent px-1 text-[12px] text-ink-700 focus:outline-none" aria-label="From date" />
              <span className="text-ink-300">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 border-0 bg-transparent px-1 text-[12px] text-ink-700 focus:outline-none" aria-label="To date" />
            </div>
          </div>
        </div>

        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th className="w-[150px]">Load</th>
                  <th>Customer</th>
                  <th>Lane</th>
                  <th>Pickup → delivery</th>
                  <th className="text-right">Revenue</th>
                  <th>Status</th>
                  <th>Driver / unit</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((load) => (
                  <tr key={load.loadId} className="cursor-pointer" onClick={() => openLoad(load.loadId)}>
                    <td>
                      <p className="mono font-medium text-ink-900">{load.loadId}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">{date(load.loadDate)} · {load.bookingType}</p>
                    </td>
                    <td>
                      <p className="max-w-[180px] truncate text-[13px] font-medium text-ink-800">{load.customerName}</p>
                      <p className="text-[11px] text-ink-400">{load.customerId}</p>
                    </td>
                    <td>
                      <p className="text-[13px] text-ink-800">{load.originCity}, {load.originState} <span className="text-ink-300">→</span> {load.destinationCity}, {load.destinationState}</p>
                      <p className="mono text-[10.5px] text-ink-400">{num(load.typicalDistanceMiles)} mi · {load.loadType}</p>
                    </td>
                    <td>
                      <p className="text-[12px] text-ink-600">{date(load.pickupScheduled ?? load.loadDate)}</p>
                      <p className="text-[11px] text-ink-400">{load.deliveryActual ? `Delivered ${date(load.deliveryActual)}` : load.deliveryScheduled ? `Due ${date(load.deliveryScheduled)}` : "Not scheduled"}</p>
                    </td>
                    <td className="text-right">
                      <p className="font-mono text-[13px] font-medium text-ink-900">{money(load.totalRevenue)}</p>
                      <p className="text-[10.5px] text-ink-400">incl. FSC</p>
                    </td>
                    <td><Badge status={load.loadStatus} /></td>
                    <td>
                      {load.driverName ? (
                        <>
                          <p className="text-[12.5px] text-ink-800">{load.driverName}</p>
                          <p className="mono text-[10.5px] text-ink-400">Unit {load.truckUnit ?? "—"}</p>
                        </>
                      ) : <span className="text-[12px] italic text-ink-400">Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            title={search || customerId || from ? "No loads match those filters" : "No loads here yet"}
            description={status === "EXCEPTION" ? "Nothing is on fire. The exception queue is clear." : "Create a load or clear the filters to see the board."}
            action={editable ? <Button variant="accent" onClick={() => setNewLoad(true)}><Plus className="h-4 w-4" /> Create load</Button> : undefined}
          />
        )}
      </Card>

      {openId ? <LoadDetail loadId={openId} onClose={closeLoad} /> : null}
      <LoadForm open={newLoad} onClose={() => setNewLoad(false)} onCreated={(id) => { setNewLoad(false); openLoad(id); }} />
    </>
  );
}
