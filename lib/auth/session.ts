import { createClient } from "@/lib/db/supabase/server";

export async function getAuthSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null };
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      displayName: user.user_metadata?.display_name ?? null,
    },
  };
}
