export const legacyViewRoutes = {
  dashboard: "dashboard",
  orders: "orders",
  calendar: "calendar",
  staff: "staff",
  hr: "hr",
  admin: "admin",
  grouping: "grouping",
  "cargo-history": "cargo-history",
  "load-plan": "load-plan",
  "mobile-overview": "mobile",
  alerts: "alerts",
  warehouse: "warehouse",
  "wh-status": "wh-status",
  settings: "settings",
  "outbound-open": "outbound-open",
  attendance: "attendance",
  "cs-queue": "cs-queue"
} as const;

export const compatibilityRedirects = {
  web: "/",
  mobile: "/field",
  classic: "/legacy/index.html"
} as const;

export type LegacyViewRoute = keyof typeof legacyViewRoutes;
export type CompatibilityRedirectRoute = keyof typeof compatibilityRedirects;

export function isLegacyViewRoute(value: string): value is LegacyViewRoute {
  return value in legacyViewRoutes;
}

export function isCompatibilityRedirectRoute(value: string): value is CompatibilityRedirectRoute {
  return value in compatibilityRedirects;
}
