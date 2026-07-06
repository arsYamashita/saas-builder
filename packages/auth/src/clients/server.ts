import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (Route Handlers / Server Actions / Server
 * Components), authenticated via the anon key + the request's cookies.
 * RLS still applies — this is NOT the service-role admin client.
 * Reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the
 * environment.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }: {
                name: string;
                value: string;
                options?: Record<string, unknown>;
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options as Parameters<typeof cookieStore.set>[2]
                );
              }
            );
          } catch {
            // Route Handler / Server Action outside mutable cookie context
          }
        },
      },
    }
  );
}
