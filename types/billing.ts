export type BillingAccessResult = {
  isActive: boolean;
  subscriptionStatus?: string | null;
};

export type BillingProduct = {
  id: string;
  tenant_id: string;
  stripe_product_id: string | null;
  name: string;
  product_type: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type BillingPrice = {
  id: string;
  tenant_id: string;
  product_id: string;
  stripe_price_id: string | null;
  amount: number;
  currency: string;
  interval: "month" | "year" | null;
  interval_count: number | null;
  trial_days: number | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  tenant_id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  price_id: string | null;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};
