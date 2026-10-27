// Route planner — domain placeholders. No UI yet.
// Routes today are strings on Load (see src/data/mock.ts).
export interface Stop {
  name: string;
  eta?: string;
}

export interface RoutePlan {
  origin: string;
  destination: string;
  stops: Stop[];
}

export const moduleId = "route-planner" as const;
