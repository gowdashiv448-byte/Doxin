import { useState } from "react";
import { canWrite, useAuth } from "../lib/auth";
import { MasterDataPage } from "../components/MasterDataPage";
import { Badge, Tabs } from "../components/ui";

export default function NetworkPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"lanes" | "facilities">("lanes");
  const canManage = canWrite(user?.role, "ops");

  const tabs = (
    <div className="mb-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "lanes", label: "Lanes" },
          { value: "facilities", label: "Facilities" },
        ]}
      />
    </div>
  );

  if (tab === "facilities") {
    return (
      <MasterDataPage
        eyebrow="Network"
        title="Facilities"
        description="Terminals, warehouses and cross-docks with dock capacity and operating hours."
        path="/api/facilities"
        idKey="facilityId"
        canManage={canManage}
        pageSize={30}
        headerExtra={tabs}
        searchPlaceholder="Name, city, state…"
        filters={[{ key: "type", label: "type", column: "facility_type", options: ["Cross-Dock", "Distribution Center", "Terminal", "Warehouse"].map((v) => ({ value: v, label: v })) }]}
        columns={[
          { key: "facilityName", label: "Facility", render: (row) => <div><p className="text-[13px] font-medium text-ink-900">{row.facilityName}</p><p className="mono text-[10.5px] text-ink-400">{row.facilityId}</p></div> },
          { key: "facilityType", label: "Type", render: (row) => <Badge tone="info">{row.facilityType}</Badge> },
          { key: "city", label: "Location", render: (row) => `${row.city}, ${row.state}` },
          { key: "dockDoors", label: "Docks", render: (row) => <span className="font-mono">{row.dockDoors ?? "—"}</span> },
          { key: "operatingHours", label: "Hours" },
          { key: "contactName", label: "Contact", render: (row) => row.contactName ?? row.contactPhone ?? "—" },
        ]}
        fields={[
          { key: "facilityName", label: "Facility name", required: true, span: 2 },
          { key: "facilityType", label: "Type", type: "select", required: true, options: ["Cross-Dock", "Distribution Center", "Terminal", "Warehouse"].map((v) => ({ value: v, label: v })) },
          { key: "operatingHours", label: "Operating hours", type: "select", options: ["24/7", "6AM-10PM", "7AM-7PM", "8AM-5PM"].map((v) => ({ value: v, label: v })) },
          { key: "city", label: "City", required: true },
          { key: "state", label: "State", required: true, placeholder: "TX" },
          { key: "dockDoors", label: "Dock doors", type: "number" },
          { key: "latitude", label: "Latitude", type: "number" },
          { key: "longitude", label: "Longitude", type: "number" },
          { key: "address", label: "Address", span: 2 },
          { key: "contactName", label: "Contact name" },
          { key: "contactPhone", label: "Contact phone", type: "tel" },
        ]}
        defaults={{ facilityType: "Cross-Dock", operatingHours: "24/7" }}
      />
    );
  }

  return (
    <MasterDataPage
      eyebrow="Network"
      title="Lanes"
      description="Origin–destination lanes with distance, rate structure and transit expectations."
      path="/api/routes"
      idKey="routeId"
      canManage={canManage}
      pageSize={30}
      headerExtra={tabs}
      searchPlaceholder="Origin, destination, lane ID…"
      columns={[
        { key: "originCity", label: "Lane", render: (row) => <div><p className="text-[13px] font-medium text-ink-900">{row.originCity}, {row.originState} → {row.destinationCity}, {row.destinationState}</p><p className="mono text-[10.5px] text-ink-400">{row.routeId}</p></div> },
        { key: "typicalDistanceMiles", label: "Distance", align: "right", render: (row) => <span className="font-mono">{Number(row.typicalDistanceMiles).toLocaleString()} mi</span> },
        { key: "baseRatePerMile", label: "Base rate", align: "right", render: (row) => <span className="font-mono">${Number(row.baseRatePerMile).toFixed(2)}/mi</span> },
        { key: "fuelSurchargeRate", label: "FSC", align: "right", render: (row) => <span className="font-mono">${Number(row.fuelSurchargeRate).toFixed(2)}/mi</span> },
        { key: "typicalTransitDays", label: "Transit", render: (row) => `${row.typicalTransitDays} day${row.typicalTransitDays === 1 ? "" : "s"}` },
        { key: "isActive", label: "Status", render: (row) => <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</Badge> },
      ]}
      fields={[
        { key: "originCity", label: "Origin city", required: true },
        { key: "originState", label: "Origin state", required: true, placeholder: "IL" },
        { key: "destinationCity", label: "Destination city", required: true },
        { key: "destinationState", label: "Destination state", required: true, placeholder: "OH" },
        { key: "typicalDistanceMiles", label: "Distance (miles)", type: "number", required: true },
        { key: "baseRatePerMile", label: "Base rate per mile", type: "number", required: true },
        { key: "fuelSurchargeRate", label: "Fuel surcharge per mile", type: "number" },
        { key: "typicalTransitDays", label: "Transit days", type: "number" },
        { key: "isActive", label: "Active lane", type: "select", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
      ]}
      defaults={{ typicalTransitDays: "1", fuelSurchargeRate: "0", isActive: "true" }}
      transform={(payload) => ({ ...payload, isActive: payload.isActive === true || payload.isActive === "true" })}
    />
  );
}
