import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/db/supabase/admin";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const supabase = createAdminClient();
    const stripe = getStripeClient();

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Load subscription error:", error.message);
      return NextResponse.json(
        { error: "Failed to load subscription" },
        { status: 500 }
      );
    }

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found" },
        { status: 404 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Create portal session error:", error);

    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
