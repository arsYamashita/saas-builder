/**
 * Cleanup script for e2e test data.
 *
 * Deletes content and plans with names starting with "e2e_" prefix.
 * Uses Supabase service role (admin) — bypasses RLS.
 *
 * Usage:
 *   npx tsx scripts/cleanup-e2e-data.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const E2E_PREFIX = "e2e_";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Cleanup contents
  const { data: contents, error: cErr } = await supabase
    .from("contents")
    .select("id, title")
    .ilike("title", `${E2E_PREFIX}%`);

  if (cErr) {
    console.error("Failed to fetch contents:", cErr.message);
  } else if (contents.length === 0) {
    console.log("No e2e contents to clean up.");
  } else {
    console.log(`Found ${contents.length} e2e content(s):`);
    for (const c of contents) {
      console.log(`  - ${c.title} (${c.id})`);
    }
    const ids = contents.map((c) => c.id);
    const { error: delErr } = await supabase
      .from("contents")
      .delete()
      .in("id", ids);
    if (delErr) {
      console.error("Failed to delete contents:", delErr.message);
    } else {
      console.log(`Deleted ${ids.length} content(s).`);
    }
  }

  // Cleanup membership plans
  const { data: plans, error: pErr } = await supabase
    .from("membership_plans")
    .select("id, name")
    .ilike("name", `${E2E_PREFIX}%`);

  if (pErr) {
    console.error("Failed to fetch plans:", pErr.message);
  } else if (plans.length === 0) {
    console.log("No e2e plans to clean up.");
  } else {
    console.log(`Found ${plans.length} e2e plan(s):`);
    for (const p of plans) {
      console.log(`  - ${p.name} (${p.id})`);
    }
    const ids = plans.map((p) => p.id);
    const { error: delErr } = await supabase
      .from("membership_plans")
      .delete()
      .in("id", ids);
    if (delErr) {
      console.error("Failed to delete plans:", delErr.message);
    } else {
      console.log(`Deleted ${ids.length} plan(s).`);
    }
  }

  console.log("Done.");
}

main();
