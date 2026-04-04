import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { membershipPlanWithPricingSchema } from "@/lib/validation/membership-plan";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { getStripeClient } from "@/lib/billing/stripe";

export async function GET() {
  try {
    const membership = await requireTenantRole("admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("membership_plans")
      .select(
        `
        *,
        billing_prices (
          id,
          stripe_price_id,
          amount,
          currency,
          interval,
          interval_count,
          trial_days,
          status
        )
      `
      )
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch plans error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch plans" },
        { status: 500 }
      );
    }

    return NextResponse.json({ plans: data });
  } catch (error) {
    console.error("Fetch plans unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to fetch plans" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const body = await req.json();
    const parsed = membershipPlanWithPricingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const tenantId = membership.tenant_id;

    // Insert the plan row first (without price_id — set after Stripe sync)
    const { data: plan, error: planError } = await supabase
      .from("membership_plans")
      .insert({
        tenant_id: tenantId,
        name: input.name,
        description: input.description || null,
        price_id: null,
        status: input.status,
      })
      .select()
      .single();

    if (planError || !plan) {
      console.error("Create plan error:", planError?.message);
      return NextResponse.json(
        { error: "Failed to create plan" },
        { status: 500 }
      );
    }

    let finalPlan = plan;

    // If pricing fields are provided, auto-create Stripe Product + Price
    if (input.amount && input.interval) {
      try {
        const stripe = getStripeClient();

        // Create Stripe Product
        const stripeProduct = await stripe.products.create({
          name: input.name,
          description: input.description || undefined,
          metadata: {
            tenant_id: tenantId,
            plan_id: plan.id,
          },
        });

        // Create Stripe Price
        const stripePriceParams: Parameters<typeof stripe.prices.create>[0] = {
          product: stripeProduct.id,
          unit_amount: input.amount,
          currency: (input.currency || "jpy").toLowerCase(),
          recurring: {
            interval: input.interval,
            interval_count: 1,
          },
          metadata: {
            tenant_id: tenantId,
            plan_id: plan.id,
          },
        };

        const stripePrice = await stripe.prices.create(stripePriceParams);

        // Upsert billing_products
        const { data: billingProduct, error: productError } = await supabase
          .from("billing_products")
          .insert({
            tenant_id: tenantId,
            stripe_product_id: stripeProduct.id,
            name: input.name,
            product_type: "subscription",
            status: "active",
          })
          .select()
          .single();

        if (productError || !billingProduct) {
          console.error("Create billing_products error:", productError?.message);
        } else {
          // Insert billing_prices
          const { data: billingPrice, error: priceError } = await supabase
            .from("billing_prices")
            .insert({
              tenant_id: tenantId,
              product_id: billingProduct.id,
              stripe_price_id: stripePrice.id,
              amount: input.amount,
              currency: (input.currency || "jpy").toLowerCase(),
              interval: input.interval,
              interval_count: 1,
              trial_days: input.trial_days ?? null,
              status: "active",
            })
            .select()
            .single();

          if (priceError || !billingPrice) {
            console.error("Create billing_prices error:", priceError?.message);
          } else {
            // Link the price back to the plan
            const { data: updatedPlan } = await supabase
              .from("membership_plans")
              .update({
                price_id: billingPrice.id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", plan.id)
              .eq("tenant_id", tenantId)
              .select()
              .single();

            if (updatedPlan) {
              finalPlan = updatedPlan;
            }
          }
        }
      } catch (stripeError) {
        console.error("Stripe sync error during plan creation:", stripeError);
        // Return the plan without pricing rather than failing the whole request
      }
    }

    await writeAuditLog({
      tenantId,
      actorUserId: user.id,
      action: "membership_plan.create",
      resourceType: "membership_plan",
      resourceId: finalPlan.id,
      afterJson: finalPlan,
    });

    return NextResponse.json({ plan: finalPlan }, { status: 201 });
  } catch (error) {
    console.error("Create plan unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to create plan" },
      { status: 500 }
    );
  }
}
