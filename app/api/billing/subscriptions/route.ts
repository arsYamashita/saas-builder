import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

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
