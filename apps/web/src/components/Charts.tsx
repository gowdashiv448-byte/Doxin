import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactMoney, num } from "../lib/format";

const axis = { fontSize: 10, fill: "#75879A", fontFamily: "IBM Plex Mono" };

export function TrendChart({ data }: { data: { date: string; loads: number; revenue: string | number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="loadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--signal-500))" stopOpacity={0.25} />
            <stop offset="100%" stopColor="rgb(var(--signal-500))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="#E6EBEF" vertical={false} />
        <XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E6EBEF", fontSize: 12, boxShadow: "0 8px 24px rgba(14,21,32,.08)" }}
          labelFormatter={(v) => `Day ${v}`}
        />
        <Area type="monotone" dataKey="loads" stroke="rgb(var(--signal-500))" strokeWidth={2} fill="url(#loadsFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueChart({ data }: { data: { month: string; revenue: string | number; fuelCost: string | number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="2 4" stroke="#E6EBEF" vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(2)} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v: number) => compactMoney(v)} width={60} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E6EBEF", fontSize: 12 }}
          formatter={(value: number, name: string) => [compactMoney(value), name]}
        />
        <Bar dataKey="revenue" fill="#16202E" radius={[2, 2, 0, 0]} maxBarSize={18} name="Revenue" />
        <Bar dataKey="fuelCost" fill="rgb(var(--signal-400))" radius={[2, 2, 0, 0]} maxBarSize={18} name="Fuel" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SplitChart({ data, colors = ["#16202E", "rgb(var(--signal-500))", "#0EA5E9", "#10B981", "#A855F7"] }: { data: { name: string; value: number }[]; colors?: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={78} paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => num(value)} contentStyle={{ borderRadius: 8, border: "1px solid #E6EBEF", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
