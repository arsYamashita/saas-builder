import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getStripeClient } from "@/lib/billing/stripe";

// GET /api/billing/subscriptions — list subscriptions for the current user
export async function GET() {
  try {
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch subscriptions error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch subscriptions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ subscriptions: data });
  } catch (error) {
    console.error("Fetch subscriptions unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}

// DELETE /api/billing/subscriptions — cancel the active subscription at period end
export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    const supabase = createAdminClient();
    const stripe = getStripeClient();

    // Fetch the most recent active or trialing subscription for this user
    const { data: subscription, error: fetchError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch subscription error:", fetchError.message);
      return NextResponse.json(
        { error: "Failed to load subscription" },
        { status: 500 }
      );
    }

    if (!subscription?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    // Cancel at period end (not immediately) — safer for users
    const updated = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    // Reflect the change immediately in Supabase so the UI updates without waiting for webhook
    await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("stripe_subscription_id", subscription.stripe_subscription_id);

    return NextResponse.json({
      message: "Subscription will be cancelled at the end of the current period",
      cancel_at: updated.cancel_at
        ? new Date(updated.cancel_at * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);

    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
