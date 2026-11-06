import { canWrite, useAuth } from "../lib/auth";
import { MasterDataPage } from "../components/MasterDataPage";
import { Badge } from "../components/ui";

export default function DriversPage() {
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "ops");
  return (
    <MasterDataPage
      eyebrow="Fleet Team"
      title="Drivers"
      description="Driver roster, licence details and status. Only active drivers can be assigned to trips."
      path="/api/drivers"
      idKey="driverId"
      canManage={canManage}
      pageSize={30}
      searchPlaceholder="Name, ID, licence, hub…"
      filters={[
        { key: "employmentStatus", label: "status", column: "employment_status", options: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On leave" }, { value: "Inactive", label: "Inactive" }, { value: "Terminated", label: "Terminated" }] },
        { key: "available", label: "availability", column: "available", options: [{ value: "true", label: "Available (Free)" }, { value: "false", label: "On Active Trip" }] },
      ]}
      columns={[
        {
          key: "lastName",
          label: "Driver",
          render: (row) => (
            <div>
              <p className="text-[13px] font-medium text-ink-900">{row.firstName} {row.lastName}</p>
              <p className="mono text-[10.5px] text-ink-400">{row.driverId} · {row.homeTerminal ?? "No base"}</p>
            </div>
          ),
        },
        { key: "employmentStatus", label: "Status", render: (row) => <Badge status={row.employmentStatus.toUpperCase().replace(" ", "_")} /> },
        { key: "cdlClass", label: "Licence Type", render: (row) => <span className="mono">Class {row.cdlClass ?? "—"}</span> },
        { key: "licenseNumber", label: "Licence No.", render: (row) => <span className="mono text-[11.5px]">{row.licenseNumber ?? "—"} {row.licenseState ? `· ${row.licenseState}` : ""}</span> },
        { key: "yearsExperience", label: "Experience", render: (row) => `${row.yearsExperience ?? 0} yrs` },
        { key: "hireDate", label: "Joined", render: (row) => <span className="text-[12px]">{row.hireDate ?? "—"}</span> },
        { key: "phone", label: "Phone", render: (row) => <span className="mono text-[11.5px]">{row.phone ?? "—"}</span> },
      ]}
      fields={[
        { key: "firstName", label: "First name", required: true },
        { key: "lastName", label: "Last name", required: true },
        { key: "phone", label: "Mobile / Phone", type: "tel" },
        { key: "email", label: "Email", type: "email" },
        { key: "employmentStatus", label: "Status", type: "select", required: true, options: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On leave" }, { value: "Inactive", label: "Inactive" }, { value: "Terminated", label: "Terminated" }] },
        { key: "homeTerminal", label: "Home Hub / Base" },
        { key: "cdlClass", label: "Licence Type", type: "select", options: [{ value: "A", label: "Heavy (Class A / HMV)" }, { value: "B", label: "Medium (Class B)" }, { value: "C", label: "Light (Class C / LMV)" }] },
        { key: "yearsExperience", label: "Experience (Years)", type: "number" },
        { key: "licenseNumber", label: "Driving Licence Number" },
        { key: "licenseState", label: "Licence State" },
        { key: "hireDate", label: "Joining Date", type: "date" },
        { key: "dateOfBirth", label: "Date of Birth", type: "date" },
        { key: "terminationDate", label: "Leaving Date", type: "date" },
        { key: "emergencyContact", label: "Emergency Contact" },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      defaults={{ employmentStatus: "Active", cdlClass: "A" }}
    />
  );
}
