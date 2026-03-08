export type AffiliateTrackingResult = {
  affiliateCode?: string | null;
  visitorToken?: string | null;
};

export type Affiliate = {
  id: string;
  tenant_id: string;
  user_id: string;
  code: string;
  commission_type: "fixed" | "percentage";
  commission_value: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type Referral = {
  id: string;
  tenant_id: string;
  affiliate_id: string;
  visitor_token: string | null;
  referred_user_id: string | null;
  first_clicked_at: string | null;
  converted_at: string | null;
  status: "clicked" | "signed_up" | "converted";
  created_at: string;
  updated_at: string;
};

export type Commission = {
  id: string;
  tenant_id: string;
  affiliate_id: string;
  referral_id: string | null;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "rejected";
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};
