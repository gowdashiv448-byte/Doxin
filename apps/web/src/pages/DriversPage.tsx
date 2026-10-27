import { canWrite, useAuth } from "../lib/auth";
import { MasterDataPage } from "../components/MasterDataPage";
import { Badge } from "../components/ui";

export default function DriversPage() {
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "ops");
  return (
    <MasterDataPage
      eyebrow="Network"
      title="Drivers"
      description="Driver roster, licensing and availability. Only active drivers can be assigned to a load."
      path="/api/drivers"
      idKey="driverId"
      canManage={canManage}
      pageSize={30}
      searchPlaceholder="Name, ID, licence, terminal…"
      filters={[
        { key: "employmentStatus", label: "status", column: "employment_status", options: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On leave" }, { value: "Inactive", label: "Inactive" }, { value: "Terminated", label: "Terminated" }] },
      ]}
      columns={[
        {
          key: "lastName",
          label: "Driver",
          render: (row) => (
            <div>
              <p className="text-[13px] font-medium text-ink-900">{row.firstName} {row.lastName}</p>
              <p className="mono text-[10.5px] text-ink-400">{row.driverId} · {row.homeTerminal ?? "No terminal"}</p>
            </div>
          ),
        },
        { key: "employmentStatus", label: "Status", render: (row) => <Badge status={row.employmentStatus.toUpperCase().replace(" ", "_")} /> },
        { key: "cdlClass", label: "CDL", render: (row) => <span className="mono">Class {row.cdlClass ?? "—"}</span> },
        { key: "licenseNumber", label: "Licence", render: (row) => <span className="mono text-[11.5px]">{row.licenseNumber ?? "—"} {row.licenseState ? `· ${row.licenseState}` : ""}</span> },
        { key: "yearsExperience", label: "Experience", render: (row) => `${row.yearsExperience ?? 0} yrs` },
        { key: "hireDate", label: "Hired", render: (row) => <span className="text-[12px]">{row.hireDate ?? "—"}</span> },
        { key: "phone", label: "Phone", render: (row) => <span className="mono text-[11.5px]">{row.phone ?? "—"}</span> },
      ]}
      fields={[
        { key: "firstName", label: "First name", required: true },
        { key: "lastName", label: "Last name", required: true },
        { key: "phone", label: "Phone", type: "tel" },
        { key: "email", label: "Email", type: "email" },
        { key: "employmentStatus", label: "Employment status", type: "select", required: true, options: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On leave" }, { value: "Inactive", label: "Inactive" }, { value: "Terminated", label: "Terminated" }] },
        { key: "homeTerminal", label: "Home terminal" },
        { key: "cdlClass", label: "CDL class", type: "select", options: [{ value: "A", label: "Class A" }, { value: "B", label: "Class B" }, { value: "C", label: "Class C" }] },
        { key: "yearsExperience", label: "Years of experience", type: "number" },
        { key: "licenseNumber", label: "Licence number" },
        { key: "licenseState", label: "Licence state" },
        { key: "hireDate", label: "Hire date", type: "date" },
        { key: "dateOfBirth", label: "Date of birth", type: "date" },
        { key: "terminationDate", label: "Termination date", type: "date" },
        { key: "emergencyContact", label: "Emergency contact" },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      defaults={{ employmentStatus: "Active", cdlClass: "A" }}
    />
  );
}
