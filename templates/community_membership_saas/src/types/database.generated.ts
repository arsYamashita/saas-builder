// ============================================================
// community_membership_saas — Generated Database Types
// ============================================================
// AUTO-GENERATED. Do not hand-edit — regenerate with:
//   bash scripts/schema-drift/regen-and-diff.sh templates/community_membership_saas
// (applies supabase/migrations/*.sql to a throwaway Postgres and runs
// `supabase gen types typescript --db-url ...`; see that script for the
// exact recipe, including the auth.users stub every Supabase-style
// migration set implicitly depends on).
//
// This file is the SINGLE SOURCE OF TRUTH schema snapshot used by
// scripts/schema-drift-gate-check.ts to detect drift between
// database.ts (hand-written, kept for now as the app-facing named types —
// see schema-drift.config.json) and the real schema. If this file is
// stale relative to supabase/migrations/, the "Schema Drift — regen
// check" CI job (currently informational; see docs/schema-drift-guide.md)
// will flag it.
//
// Generated 2026-07-13 from supabase/migrations/00001_schema.sql +
// 00002_rls.sql (the only migrations present on `main` at generation
// time — see docs/schema-drift-guide.md for what to do when 00003+
// forum/classroom/gamification/member_mgmt migrations land, currently on
// the not-yet-merged feat/comunavi-v2-forum branch).
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          id: string
          ip_address: string | null
          resource_id: string
          resource_type: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id: string
          resource_type: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id?: string
          resource_type?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_rules: {
        Row: {
          content_id: string
          created_at: string
          id: string
          plan_id: string | null
          rule_type: Database["public"]["Enums"]["access_rule_type"]
          tag_id: string | null
          tenant_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          plan_id?: string | null
          rule_type: Database["public"]["Enums"]["access_rule_type"]
          tag_id?: string | null
          tenant_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          plan_id?: string | null
          rule_type?: Database["public"]["Enums"]["access_rule_type"]
          tag_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_rules_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_content_access_rules_tag"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          body: string | null
          content_type: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          excerpt: string | null
          id: string
          price_amount: number | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          stripe_price_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          visibility_mode: Database["public"]["Enums"]["visibility_mode"]
        }
        Insert: {
          body?: string | null
          content_type?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          excerpt?: string | null
          id?: string
          price_amount?: number | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          stripe_price_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          visibility_mode?: Database["public"]["Enums"]["visibility_mode"]
        }
        Update: {
          body?: string | null
          content_type?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          excerpt?: string | null
          id?: string
          price_amount?: number | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          stripe_price_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          visibility_mode?: Database["public"]["Enums"]["visibility_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "contents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          name: string
          price_amount: number | null
          sort_order: number
          status: Database["public"]["Enums"]["plan_status"]
          stripe_price_id: string | null
          stripe_price_id_yearly: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          name: string
          price_amount?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_price_id?: string | null
          stripe_price_id_yearly?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          name?: string
          price_amount?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_price_id?: string | null
          stripe_price_id_yearly?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount: number
          content_id: string
          created_at: string
          currency: string
          id: string
          purchased_at: string | null
          status: Database["public"]["Enums"]["purchase_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          content_id: string
          created_at?: string
          currency?: string
          id?: string
          purchased_at?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          content_id?: string
          created_at?: string
          currency?: string
          id?: string
          purchased_at?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string
          stripe_subscription_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string
          stripe_subscription_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string
          stripe_subscription_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_type: string
          slug: string
          status: string
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_type?: string
          slug: string
          status?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_type?: string
          slug?: string
          status?: string
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_tags: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          tag_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          tag_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          tag_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dearmor: { Args: { "": string }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      has_role: {
        Args: {
          p_required: Database["public"]["Enums"]["app_role"]
          p_tenant_id: string
        }
        Returns: boolean
      }
      is_tenant_member: { Args: { p_tenant_id: string }; Returns: boolean }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
    }
    Enums: {
      access_rule_type: "plan_based" | "purchase_based" | "tag_based"
      app_role: "owner" | "admin" | "editor" | "member"
      content_status: "draft" | "published" | "archived"
      membership_status: "active" | "inactive" | "suspended"
      plan_status: "active" | "inactive" | "draft"
      purchase_status: "pending" | "completed" | "refunded" | "failed"
      subscription_status:
        | "active"
        | "past_due"
        | "canceled"
        | "trialing"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      visibility_mode: "public" | "members_only" | "rules_based"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_rule_type: ["plan_based", "purchase_based", "tag_based"],
      app_role: ["owner", "admin", "editor", "member"],
      content_status: ["draft", "published", "archived"],
      membership_status: ["active", "inactive", "suspended"],
      plan_status: ["active", "inactive", "draft"],
      purchase_status: ["pending", "completed", "refunded", "failed"],
      subscription_status: [
        "active",
        "past_due",
        "canceled",
        "trialing",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      visibility_mode: ["public", "members_only", "rules_based"],
    },
  },
} as const

