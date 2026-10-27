import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, CircleDollarSign, Clock3, Package, Plus, RefreshCw, ShieldAlert, Truck, Users } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, SectionTitle, StatCard, LoadingBlock } from "../components/ui";
import { LoadForm } from "../components/LoadForm";
import { TrendChart } from "../components/Charts";
import { compactMoney, date, money, num, pct } from "../lib/format";

interface Summary {
  asOf: string;
  loadsToday: number;
  activeLoads: number;
  inTransit: number;
  deliveredToday: number;
  exceptions: number;
  revenueToday: string;
  fuelSpend30d: string;
  maintenanceDue: number;
  activeDrivers: number;
  availableTrucks: number;
  onTimeRate: string;
  utilizationRate: string;
  trend: { date: string; loads: number; revenue: string; onTimeRate: string }[];
  recentLoads: {
    loadId: string;
    loadStatus: string;
    loadDate: string;
    customerName: string;
    originCity: string;
    destinationCity: string;
    driverName: string | null;
    truckUnit: string | null;
    tripId: string | null;
  }[];
  exceptionsList: { loadId: string; exceptionReason: string; customerName: string; loadStatus: string }[];
  maintenance: { truckId: string; unitNumber: string; status: string; nextServiceDue: string | null }[];
}

export default function DashboardPage() {
  const [newLoad, setNewLoad] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.get<Summary>("/api/dashboard/summary"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Operations overview" description="Live picture of today's desk." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="card h-[118px] p-4"><div className="skeleton h-3 w-24" /><div className="skeleton mt-3 h-7 w-28" /></div>)}
        </div>
        <Card className="mt-4"><LoadingBlock rows={6} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Control tower"
        title="Operations overview"
        description={`Live view for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. ${data.activeLoads} loads in motion across the network.`}
        actions={
          <>
            <Button variant="ghost" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="accent" onClick={() => setNewLoad(true)}>
              <Plus className="h-4 w-4" /> Create load
            </Button>
          </>
        }
      />

      {data.exceptions > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
          <p className="flex-1 text-[12.5px] text-red-800">
            <span className="font-semibold">{data.exceptions} load{data.exceptions === 1 ? "" : "s"} need attention.</span>{" "}
            {data.exceptionsList[0]?.exceptionReason ?? "Review the exception queue and recover the delivery."}
          </p>
          <Link to="/loads?status=EXCEPTION" className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-700 hover:text-red-900">
            Open queue <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue today" value={money(data.revenueToday)} sub={`${data.loadsToday} loads booked today`} icon={<CircleDollarSign className="h-4 w-4" />} />
        <StatCard label="Active loads" value={num(data.activeLoads)} sub={`${data.deliveredToday} delivered today`} icon={<Package className="h-4 w-4" />} />
        <StatCard label="In transit" value={num(data.inTransit)} sub="Rolling on the network" icon={<Truck className="h-4 w-4" />} tone="warning" />
        <StatCard label="On-time rate" value={pct(data.onTimeRate)} sub="Deliveries · last 30 days" icon={<Clock3 className="h-4 w-4" />} tone={Number(data.onTimeRate) >= 90 ? "positive" : "warning"} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available trucks" value={num(data.availableTrucks)} sub={`${pct(data.utilizationRate)} fleet utilization`} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Active drivers" value={num(data.activeDrivers)} sub="Eligible to dispatch" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Maintenance due" value={num(data.maintenanceDue)} sub="Within service window" icon={<AlertTriangle className="h-4 w-4" />} tone={data.maintenanceDue > 0 ? "warning" : "neutral"} />
        <StatCard label="Fuel spend · 30d" value={compactMoney(data.fuelSpend30d)} sub="Across all tractors" icon={<CircleDollarSign className="h-4 w-4" />} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            title="Loads in motion"
            description="Booked through in-transit, oldest first."
            action={<Link to="/loads" className="text-[12px] font-medium text-ink-500 hover:text-ink-900">View all loads →</Link>}
          />
          {data.recentLoads.length ? (
            <DataTable>
              <thead>
                <tr>
                  <th>Load</th>
                  <th>Customer</th>
                  <th>Lane</th>
                  <th>Status</th>
                  <th>Driver / unit</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLoads.map((load) => (
                  <tr key={load.loadId} className="cursor-pointer" onClick={() => navigate(`/loads?open=${load.loadId}`)}>
                    <td>
                      <span className="mono font-medium text-ink-900">{load.loadId}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">{date(load.loadDate)}</span>
                    </td>
                    <td className="max-w-[180px] truncate">{load.customerName}</td>
                    <td>
                      <span className="text-[13px]">{load.originCity}</span>
                      <span className="mx-1 text-ink-300">→</span>
                      <span className="text-[13px]">{load.destinationCity}</span>
                    </td>
                    <td><Badge status={load.loadStatus} /></td>
                    <td>
                      {load.driverName ? (
                        <>
                          <span className="block text-[13px] text-ink-800">{load.driverName}</span>
                          <span className="mono text-[10.5px] text-ink-400">Unit {load.truckUnit ?? "—"}</span>
                        </>
                      ) : (
                        <span className="text-[12px] italic text-ink-400">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="No active loads" description="Create a load to get the desk moving." action={<Button variant="accent" onClick={() => setNewLoad(true)}><Plus className="h-4 w-4" /> Create load</Button>} />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="14-day load volume" description="Booked loads per day" />
            <div className="px-2 pb-3">
              <TrendChart data={data.trend} />
            </div>
          </Card>

          <Card>
            <SectionTitle title="Service watchlist" description="Trucks approaching or inside the PM window" action={<Link to="/fleet?tab=maintenance" className="text-[12px] font-medium text-ink-500 hover:text-ink-900">Fleet →</Link>} />
            <div className="space-y-1 px-3 pb-3">
              {data.maintenance.length ? data.maintenance.map((truck) => (
                <div key={truck.truckId} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-ink-50">
                  <div>
                    <p className="text-[13px] font-medium text-ink-800">Unit {truck.unitNumber}</p>
                    <p className="mono text-[10.5px] text-ink-400">{truck.truckId}</p>
                  </div>
                  <div className="text-right">
                    <Badge status={truck.status} />
                    <p className="mt-1 text-[10.5px] text-ink-400">{truck.nextServiceDue ? `Due ${date(truck.nextServiceDue)}` : "Review service"}</p>
                  </div>
                </div>
              )) : <p className="px-2 py-4 text-center text-[12px] text-ink-400">All tractors are inside service limits.</p>}
            </div>
          </Card>
        </div>
      </div>

      <LoadForm
        open={newLoad}
        onClose={() => setNewLoad(false)}
        onCreated={(id) => {
          setNewLoad(false);
          void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          navigate(`/loads?open=${id}`);
        }}
      />
    </>
  );
}
