export {};

declare global {
  interface DashboardMetrics {
    openJobs: number;
    readyForBilling: number;
    billedAmount: number;
    pendingAmount: number;
    averageDurationMinutes: number;
    approvalSummary?: Record<string, number | string>;
    terminalSummary?: Array<{
      key: string;
      label: string;
      total: number;
      completed: number;
      risks: number;
      slaMinutes: number;
    }>;
  }

  interface DashboardData {
    jobs: Job[];
    billing: BillingRecord[];
    alerts: AlertRecord[];
    locations: Array<Record<string, unknown>>;
    metrics: DashboardMetrics;
    staffStats: Array<{
      userId: string;
      totalJobs: number;
      completedJobs: number;
      errors: number;
      averageDurationMinutes: number;
      kpi: number;
    }>;
  }

  interface BootstrapResponse {
    users: User[];
    customers: Customer[];
    dashboard: DashboardData;
  }
}
