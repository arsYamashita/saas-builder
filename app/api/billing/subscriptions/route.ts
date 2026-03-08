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
      return NextResponse.json(
        { error: "Failed to fetch subscriptions", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ subscriptions: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to fetch subscriptions", details: message },
      { status: 500 }
    );
  }
}
