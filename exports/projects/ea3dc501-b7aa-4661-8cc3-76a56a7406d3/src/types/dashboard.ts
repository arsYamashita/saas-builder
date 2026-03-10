import { AuditLog } from './database';

export interface CustomerMetrics {
  total: number;
  active: number;
  leads: number;
  inactive: number;
  new_this_month: number;
}

export interface DealStageMetrics {
  lead: number;
  qualified: number;
  proposal: number;
  negotiation: number;
  closed_won: number;
  closed_lost: number;
}

export interface DealMetrics {
  total: number;
  total_value: number;
  by_stage: DealStageMetrics;
  won_this_month: {
    count: number;
    value: number;
  };
}

export interface TaskMetrics {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
}

export interface TeamMetrics {
  total_users: number;
  by_role: {
    owner: number;
    admin: number;
    member: number;
  };
}

export interface DashboardMetrics {
  customers: CustomerMetrics;
  deals: DealMetrics;
  tasks: TaskMetrics;
  team: TeamMetrics;
  recent_activity: AuditLog[];
}