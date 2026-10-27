import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import {
  Badge,
  Card,
  DataTable,
  LoadingBlock,
  PageHeader,
  StatCard,
  Tabs,
} from "../components/ui";
import { RevenueChart } from "../components/Charts";
import { compactMoney, date, money, num, pct } from "../lib/format";

type Row = Record<string, any>;

export default function AnalyticsPage() {
  const [tab, setTab] = useState<
    "overview" | "lanes" | "customers" | "drivers" | "fleet"
  >("overview");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = { from: from || undefined, to: to || undefined };
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["analytics", "overview", query],
    queryFn: () => api.get<Row>("/api/analytics/overview", query),
  });
  const { data: monthly } = useQuery({
    queryKey: ["analytics", "monthly", query],
    queryFn: () => api.get<{ data: Row[] }>("/api/analytics/monthly", query),
  });
  const { data: lanes } = useQuery({
    queryKey: ["analytics", "lanes", query],
    queryFn: () =>
      api.get<{ data: Row[] }>("/api/analytics/lanes", { ...query, limit: 20 }),
    enabled: tab === "lanes" || tab === "overview",
  });
  const { data: customers } = useQuery({
    queryKey: ["analytics", "customers", query],
    queryFn: () =>
      api.get<{ data: Row[] }>("/api/analytics/customers", {
        ...query,
        limit: 25,
      }),
    enabled: tab === "customers",
  });
  const { data: drivers } = useQuery({
    queryKey: ["analytics", "drivers", query],
    queryFn: () =>
      api.get<{ data: Row[] }>("/api/analytics/drivers", {
        ...query,
        limit: 25,
      }),
    enabled: tab === "drivers",
  });
  const { data: fleet } = useQuery({
    queryKey: ["analytics", "fleet", query],
    queryFn: () =>
      api.get<{ data: Row[] }>("/api/analytics/fleet", { ...query, limit: 25 }),
    enabled: tab === "fleet",
  });

  const setPreset = (value: string) => {
    if (value === "all") {
      setFrom("");
      setTo("");
    } else if (value === "2024") {
      setFrom("2024-01-01");
      setTo("2024-12-31");
    } else if (value === "2023") {
      setFrom("2023-01-01");
      setTo("2023-12-31");
    } else if (value === "2022") {
      setFrom("2022-01-01");
      setTo("2022-12-31");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description="Revenue, margin, service and asset performance. Filter the full history or a single year."
        actions={
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white p-1">
            <CalendarRange className="ml-1.5 h-3.5 w-3.5 text-ink-400" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-[12px] focus:outline-none"
            />
            <span className="text-ink-300">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 border-0 bg-transparent px-1 text-[12px] focus:outline-none"
            />
            <select
              onChange={(e) => setPreset(e.target.value)}
              defaultValue=""
              className="h-7 rounded-md border-0 bg-ink-50 px-2 text-[11px] font-medium text-ink-700 focus:outline-none"
            >
              <option value="" disabled>
                Preset
              </option>
              <option value="all">All history</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
            </select>
          </div>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "lanes", label: "Lanes" },
          { value: "customers", label: "Customers" },
          { value: "drivers", label: "Drivers" },
          { value: "fleet", label: "Fleet" },
        ]}
      />

      {tab === "overview" ? (
        overviewLoading || !overview ? (
          <Card className="mt-4">
            <LoadingBlock rows={6} />
          </Card>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total revenue"
                value={compactMoney(overview.totalRevenue)}
                sub={`${num(overview.loads)} loads`}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <StatCard
                label="Contribution margin"
                value={compactMoney(overview.margin)}
                delta={`${overview.marginPct}% of revenue`}
                tone={Number(overview.margin) >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="Revenue / mile"
                value={`$${Number(overview.revenuePerMile).toFixed(2)}`}
                sub={`${num(overview.miles)} miles driven`}
              />
              <StatCard
                label="On-time delivery"
                value={pct(overview.onTimeRate)}
                sub={`${num(overview.incidents)} safety incidents`}
                tone={
                  Number(overview.onTimeRate) >= 90 ? "positive" : "warning"
                }
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Linehaul revenue"
                value={compactMoney(overview.linehaulRevenue)}
                sub="Base freight charges"
              />
              <StatCard
                label="Fuel cost"
                value={compactMoney(overview.fuelCost)}
                sub={`Avg ${Number(overview.avgMpg).toFixed(2)} MPG`}
              />
              <StatCard
                label="Maintenance cost"
                value={compactMoney(overview.maintenanceCost)}
                sub="Completed work in period"
              />
              <StatCard
                label="Claims"
                value={compactMoney(overview.claims)}
                sub="Safety claim exposure"
                tone={Number(overview.claims) ? "negative" : "neutral"}
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between px-4 py-3">
                  <h2 className="text-[14px] font-semibold">
                    Monthly revenue vs fuel
                  </h2>
                  <span className="text-[11px] text-ink-400">
                    Linehaul + FSC + accessorials
                  </span>
                </div>
                <div className="px-2 pb-3">
                  <RevenueChart
                    data={(monthly?.data ?? []).map((m) => ({
                      month: String(m.month ?? ""),
                      revenue: m.revenue ?? 0,
                      fuelCost: m.fuelCost ?? 0,
                    }))}
                  />
                </div>
              </Card>
              <Card>
                <div className="px-4 py-3">
                  <h2 className="text-[14px] font-semibold">
                    Top lanes by revenue
                  </h2>
                </div>
                <div className="space-y-2.5 px-4 pb-4">
                  {(lanes?.data ?? []).slice(0, 6).map((lane) => {
                    const max = Number(lanes?.data[0]?.revenue ?? 1);
                    return (
                      <div key={lane.routeId}>
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="truncate text-ink-700">
                            {lane.originCity} → {lane.destinationCity}
                          </span>
                          <span className="font-mono text-ink-800">
                            {compactMoney(lane.revenue)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-50">
                          <div
                            className="h-full rounded-full bg-ink-800"
                            style={{
                              width: `${Math.max(3, (Number(lane.revenue) / max) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </>
        )
      ) : null}

      {tab === "lanes" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2 overflow-hidden">
            <div className="border-b border-ink-100 px-4 py-3">
              <h2 className="text-[14px] font-semibold">Lane profitability</h2>
              <p className="text-[11px] text-ink-500">
                Revenue versus direct fuel cost, ranked by revenue.
              </p>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Lane</th>
                  <th className="text-right">Loads</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Fuel</th>
                  <th className="text-right">Margin</th>
                  <th className="text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {(lanes?.data ?? []).map((lane) => (
                  <tr key={lane.routeId}>
                    <td>
                      <p className="text-[12.5px] font-medium">
                        {lane.originCity}, {lane.originState} →{" "}
                        {lane.destinationCity}, {lane.destinationState}
                      </p>
                      <p className="mono text-[10px] text-ink-400">
                        {lane.routeId} · {num(lane.miles)} mi
                      </p>
                    </td>
                    <td className="text-right font-mono text-[12px]">
                      {num(lane.loads)}
                    </td>
                    <td className="text-right font-mono text-[12px]">
                      {compactMoney(lane.revenue)}
                    </td>
                    <td className="text-right font-mono text-[12px]">
                      {compactMoney(lane.fuelCost)}
                    </td>
                    <td className="text-right font-mono text-[12px] font-medium">
                      {compactMoney(lane.margin)}
                    </td>
                    <td className="text-right">
                      <Badge
                        tone={
                          Number(lane.marginPct) >= 60
                            ? "success"
                            : Number(lane.marginPct) >= 40
                              ? "warning"
                              : "danger"
                        }
                      >
                        {lane.marginPct}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
          <Card>
            <div className="px-4 py-3">
              <h2 className="text-[14px] font-semibold">Top lanes</h2>
              <p className="text-[11px] text-ink-500">By total revenue</p>
            </div>
            <div className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={(lanes?.data ?? [])
                    .slice(0, 8)
                    .map((l) => ({
                      name: `${l.originCity}→${l.destinationCity}`,
                      revenue: Number(l.revenue),
                    }))}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="#E6EBEF"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: "#75879A" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => compactMoney(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={118}
                    tick={{ fontSize: 9, fill: "#52657C" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => money(v)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E6EBEF",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="#16202E"
                    radius={[0, 3, 3, 0]}
                    barSize={12}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "customers" ? (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Customer performance</h2>
            <p className="text-[11px] text-ink-500">
              Revenue, loads and service level by account.
            </p>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th className="text-right">Loads</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Fuel</th>
                <th className="text-right">Margin</th>
                <th className="text-right">On-time</th>
              </tr>
            </thead>
            <tbody>
              {(customers?.data ?? []).map((customer) => (
                <tr key={customer.customerId}>
                  <td>
                    <p className="text-[12.5px] font-medium">
                      {customer.customerName}
                    </p>
                    <p className="mono text-[10px] text-ink-400">
                      {customer.customerId}
                    </p>
                  </td>
                  <td>
                    <Badge tone="info">{customer.customerType}</Badge>
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {num(customer.loads)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(customer.revenue)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(customer.fuelCost)}
                  </td>
                  <td className="text-right font-mono text-[12px] font-medium">
                    {compactMoney(customer.margin)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {customer.onTimeRate ? pct(customer.onTimeRate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}

      {tab === "drivers" ? (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Driver scorecard</h2>
            <p className="text-[11px] text-ink-500">
              Miles, revenue, MPG, idle time and safety exposure.
            </p>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Terminal</th>
                <th className="text-right">Trips</th>
                <th className="text-right">Miles</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">RPM</th>
                <th className="text-right">MPG</th>
                <th className="text-right">Idle</th>
                <th className="text-right">On-time</th>
                <th className="text-right">Incidents</th>
              </tr>
            </thead>
            <tbody>
              {(drivers?.data ?? []).map((driver) => (
                <tr key={driver.driverId}>
                  <td>
                    <p className="text-[12.5px] font-medium">
                      {driver.driverName}
                    </p>
                    <p className="mono text-[10px] text-ink-400">
                      {driver.driverId}
                    </p>
                  </td>
                  <td className="text-[12px]">{driver.homeTerminal ?? "—"}</td>
                  <td className="text-right font-mono text-[12px]">
                    {num(driver.trips)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {num(driver.miles)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(driver.revenue)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    ${Number(driver.revenuePerMile).toFixed(2)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {Number(driver.avgMpg).toFixed(2)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {Number(driver.avgIdleHours).toFixed(1)}h
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {driver.onTimeRate ? pct(driver.onTimeRate) : "—"}
                  </td>
                  <td className="text-right">
                    {Number(driver.incidents) ? (
                      <Badge tone="danger">{driver.incidents}</Badge>
                    ) : (
                      <span className="text-[12px] text-ink-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}

      {tab === "fleet" ? (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Asset productivity</h2>
            <p className="text-[11px] text-ink-500">
              Miles, revenue, fuel and maintenance cost per tractor.
            </p>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Tractor</th>
                <th>Terminal</th>
                <th className="text-right">Trips</th>
                <th className="text-right">Miles</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Fuel</th>
                <th className="text-right">Maintenance</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Cost/mi</th>
              </tr>
            </thead>
            <tbody>
              {(fleet?.data ?? []).map((truck) => (
                <tr key={truck.truckId}>
                  <td>
                    <p className="text-[12.5px] font-medium">
                      Unit {truck.unitNumber}
                    </p>
                    <p className="mono text-[10px] text-ink-400">
                      {truck.truckId} · {truck.make} {truck.modelYear}
                    </p>
                  </td>
                  <td className="text-[12px]">{truck.homeTerminal}</td>
                  <td className="text-right font-mono text-[12px]">
                    {num(truck.trips)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {num(truck.miles)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(truck.revenue)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(truck.fuelCost)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    {compactMoney(truck.maintenanceCost)}
                  </td>
                  <td className="text-right font-mono text-[12px] font-medium">
                    {compactMoney(truck.margin)}
                  </td>
                  <td className="text-right font-mono text-[12px]">
                    ${Number(truck.costPerMile).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}

      <p className="mt-4 text-[10.5px] text-ink-400">
        Margin uses linehaul + fuel surcharge + accessorials less fuel
        purchases. Maintenance is reported separately and not allocated per
        load.
      </p>
    </>
  );
}
