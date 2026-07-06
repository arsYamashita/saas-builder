import { createServerSupabaseClient } from "./clients/server";

/**
 * Resolve the current Supabase Auth session (server-side, cookie-based).
 * Returns `{ user: null }` when there is no authenticated user — callers
 * that require authentication should check for `null` and reject/redirect
 * rather than treating a null user as an anonymous-but-valid session.
 */
export async function getAuthSession() {
  const supabase = await createServerSupabaseClient();
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
