export type ContentRecord = {
  id: string;
  tenant_id: string;
  title: string;
  body?: string | null;
  content_type: string;
  visibility: string;
  published: boolean;
  published_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipPlanRecord = {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  price_id?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
