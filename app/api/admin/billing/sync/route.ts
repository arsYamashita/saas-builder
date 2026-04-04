import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

const syncPlanSchema = z.object({
  planId: z.string().uuid("planId must be a valid UUID"),
  name: z.string().min(1, "name is required"),
  description: z.string().optional().default(""),
  amount: z.number().int().positive("amount must be a positive integer"),
  currency: z.string().min(1).default("jpy"),
  interval: z.enum(["month", "year"]),
  trialDays: z.number().int().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const tenantId = membership.tenant_id;

    const body = await req.json();
    const parsed = syncPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { planId, name, description, amount, currency, interval, trialDays } =
      parsed.data;

    const supabase = createAdminClient();

    // Verify the plan belongs to this tenant
    const { data: plan, error: planError } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("tenant_id", tenantId)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    const stripe = getStripeClient();

    // Find or create Stripe Product
    let stripeProductId: string;

    const { data: existingProduct } = await supabase
      .from("billing_products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("name", name)
      .eq("product_type", "subscription")
      .maybeSingle();

    if (existingProduct?.stripe_product_id) {
      // Update existing Stripe product metadata
      await stripe.products.update(existingProduct.stripe_product_id, {
        name,
        description: description || undefined,
      });
      stripeProductId = existingProduct.stripe_product_id;
    } else {
      // Create a new Stripe Product
      const stripeProduct = await stripe.products.create({
        name,
        description: description || undefined,
        metadata: {
          tenant_id: tenantId,
          plan_id: planId,
        },
      });
      stripeProductId = stripeProduct.id;
    }

    // Upsert billing_products record
    const { data: billingProduct, error: productError } = await supabase
      .from("billing_products")
      .upsert(
        {
          tenant_id: tenantId,
          stripe_product_id: stripeProductId,
          name,
          product_type: "subscription",
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stripe_product_id" }
      )
      .select()
      .single();

    if (productError || !billingProduct) {
      console.error("Upsert billing_products error:", productError?.message);
      return NextResponse.json(
        { error: "Failed to save billing product" },
        { status: 500 }
      );
    }

    // Create a new Stripe Price (prices are immutable in Stripe — always create new)
    const stripePrice = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: amount,
      currency: currency.toLowerCase(),
      recurring: {
        interval,
        interval_count: 1,
        ...(trialDays && trialDays > 0
          ? { trial_period_days: trialDays }
          : {}),
      },
      metadata: {
        tenant_id: tenantId,
        plan_id: planId,
      },
    });

    // Archive old active prices for this product to avoid stale prices
    const { data: oldPrices } = await supabase
      .from("billing_prices")
      .select("stripe_price_id")
      .eq("tenant_id", tenantId)
      .eq("product_id", billingProduct.id)
      .eq("status", "active");

    if (oldPrices && oldPrices.length > 0) {
      for (const oldPrice of oldPrices) {
        if (
          oldPrice.stripe_price_id &&
          oldPrice.stripe_price_id !== stripePrice.id
        ) {
          await stripe.prices.update(oldPrice.stripe_price_id, {
            active: false,
          });
        }
      }

      await supabase
        .from("billing_prices")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("product_id", billingProduct.id)
        .eq("status", "active");
    }

    // Insert new billing_prices record
    const { data: billingPrice, error: priceError } = await supabase
      .from("billing_prices")
      .insert({
        tenant_id: tenantId,
        product_id: billingProduct.id,
        stripe_price_id: stripePrice.id,
        amount,
        currency: currency.toLowerCase(),
        interval,
        interval_count: 1,
        trial_days: trialDays ?? null,
        status: "active",
      })
      .select()
      .single();

    if (priceError || !billingPrice) {
      console.error("Insert billing_prices error:", priceError?.message);
      return NextResponse.json(
        { error: "Failed to save billing price" },
        { status: 500 }
      );
    }

    // Update membership_plans.price_id to point to the new billing_prices row
    const { data: updatedPlan, error: updatePlanError } = await supabase
      .from("membership_plans")
      .update({
        price_id: billingPrice.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updatePlanError || !updatedPlan) {
      console.error("Update membership_plans error:", updatePlanError?.message);
      return NextResponse.json(
        { error: "Failed to link price to plan" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      tenantId,
      actorUserId: user.id,
      action: "billing.sync",
      resourceType: "membership_plan",
      resourceId: planId,
      afterJson: {
        plan: updatedPlan,
        billing_product: billingProduct,
        billing_price: billingPrice,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePrice.id,
      },
    });

    return NextResponse.json(
      {
        plan: updatedPlan,
        billingProduct,
        billingPrice,
        stripeProductId,
        stripePriceId: stripePrice.id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin billing sync unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to sync billing plan" },
      { status: 500 }
    );
  }
}
