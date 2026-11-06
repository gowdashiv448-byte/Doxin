import { canWrite, useAuth } from "../lib/auth";
import { MasterDataPage } from "../components/MasterDataPage";
import { Badge } from "../components/ui";
import { money } from "../lib/format";

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = canWrite(user?.role, "finance") || canWrite(user?.role, "ops");
  return (
    <MasterDataPage
      eyebrow="Commercial"
      title="Customers"
      description="Customer accounts, payment terms and contact details."
      path="/api/customers"
      idKey="customerId"
      canManage={canManage}
      searchPlaceholder="Customer name, ID, contact person…"
      filters={[
        { key: "accountStatus", label: "status", column: "account_status", options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
        { key: "customerType", label: "type", column: "customer_type", options: [{ value: "Spot", label: "Spot" }, { value: "Contract", label: "Contract" }, { value: "Dedicated", label: "Dedicated" }] },
      ]}
      columns={[
        {
          key: "customerName",
          label: "Customer / Party",
          render: (row) => (
            <div>
              <p className="max-w-[240px] truncate text-[13px] font-medium text-ink-900">{row.customerName}</p>
              <p className="mono text-[10.5px] text-ink-400">{row.customerId}</p>
            </div>
          ),
        },
        { key: "customerType", label: "Type", render: (row) => <Badge tone="info">{row.customerType}</Badge> },
        { key: "primaryFreightType", label: "Cargo Type" },
        { key: "creditTermsDays", label: "Payment Terms", render: (row) => <span className="font-mono text-[12px]">{row.creditTermsDays ? `${row.creditTermsDays} days` : "Immediate"}</span> },
        { key: "accountStatus", label: "Status", render: (row) => <Badge tone={row.accountStatus === "Active" ? "success" : "neutral"}>{row.accountStatus}</Badge> },
        { key: "contactName", label: "Contact", render: (row) => <div><p className="text-[12.5px]">{row.contactName ?? "—"}</p><p className="text-[10.5px] text-ink-400">{row.contactEmail ?? row.contactPhone ?? ""}</p></div> },
        { key: "annualRevenuePotential", label: "Yearly Business", align: "right", render: (row) => <span className="font-mono text-[12.5px] font-medium">{money(row.annualRevenuePotential)}</span> },
      ]}
      fields={[
        { key: "customerName", label: "Customer / Company Name", required: true, span: 2 },
        { key: "customerType", label: "Account Type", type: "select", required: true, options: [{ value: "Spot", label: "Spot" }, { value: "Contract", label: "Contract" }, { value: "Dedicated", label: "Dedicated" }] },
        { key: "accountStatus", label: "Account Status", type: "select", required: true, options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
        { key: "creditTermsDays", label: "Payment Terms (Days)", type: "number", required: true },
        { key: "annualRevenuePotential", label: "Estimated Yearly Business (₹)", type: "number" },
        { key: "primaryFreightType", label: "Main Cargo Type", type: "select", options: ["General", "Retail", "Food/Beverage", "Automotive", "Electronics", "Consumer Goods"].map((v) => ({ value: v, label: v })) },
        { key: "contractStartDate", label: "Partner Since", type: "date" },
        { key: "contactName", label: "Contact Person" },
        { key: "contactEmail", label: "Billing Email", type: "email" },
        { key: "contactPhone", label: "Contact Phone / Mobile", type: "tel" },
        { key: "billingAddress", label: "Billing Address", type: "textarea", span: 2 },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      defaults={{ customerType: "Contract", accountStatus: "Active", creditTermsDays: "30", annualRevenuePotential: "0" }}
    />
  );
}
