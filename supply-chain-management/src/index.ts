// Supply chain management — domain placeholders.
// Source of truth for fleet overview. UI still in src/components/ops.tsx (KpiStrip).
export interface Kpi {
  label: string;
  value: string;
  delta: string;
}

export const moduleId = "supply-chain-management" as const;
