// Core logistics — domain placeholders.
// Board UI still in src/components/ops.tsx (LoadBoard); seeds in src/data/mock.ts.
export type LoadStatus = "pending" | "in_transit" | "delivered" | "exception";

export interface LoadRef {
  id: string;
  origin: string;
  destination: string;
  status: LoadStatus;
}

export const moduleId = "core-logistics" as const;
