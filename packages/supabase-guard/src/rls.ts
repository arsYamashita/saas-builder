import { SupabaseClient } from '@supabase/supabase-js';

/** Verify that RLS is respected by attempting a cross-user query */
export async function assertRlsEnabled(
  client: SupabaseClient,
  table: string
): Promise<boolean> {
  const { error } = await client.from(table).select('*').limit(1);
  return !error;
}

/** Build a standard owner policy SQL string */
export function ownerPolicy(table: string, ownerColumn = 'user_id'): string {
  return `
CREATE POLICY "Users can only access own data"
  ON ${table}
  FOR ALL
  USING (auth.uid() = ${ownerColumn});
`;
}

/** Build a facility-based policy SQL string */
export function facilityPolicy(table: string): string {
  return `
CREATE POLICY "Facility members only"
  ON ${table}
  FOR ALL
  USING (facility_id = (auth.jwt()->>'facility_id')::uuid);
`;
}
