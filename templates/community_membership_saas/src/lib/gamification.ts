// ============================================================
// community_membership_saas v2 — Gamification Helpers
// ============================================================
// Leaderboard, points, level computation, and point awarding.
// Uses service_role client (createAdminClient) for all queries.
// DB triggers handle member_points updates on reaction events.
// These helpers are for API-level operations and manual awards.
// ============================================================

import { createAdminClient } from "@/lib/db/supabase/admin";
import type { PointEventType, LevelConfig } from "@/types/database";
import { DEFAULT_LEVEL_THRESHOLDS } from "@/types/database";

// ─── Types ───

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  total_points: number;
  level: number;
  level_name: string;
};

export type MemberPointsInfo = {
  total_points: number;
  level: number;
  level_name: string;
  next_level_name: string | null;
  points_to_next_level: number | null;
};

// ─── getLeaderboard ───
// member_points JOIN users, ordered by total_points DESC.

export async function getLeaderboard(
  tenantId: string,
  limit = 20,
  offset = 0
): Promise<LeaderboardEntry[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("member_points")
    .select("user_id, total_points, level, users(display_name, avatar_url)")
    .eq("tenant_id", tenantId)
    .order("total_points", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch leaderboard: ${error.message}`);
  }

  const configs = await getLevelConfigs(tenantId);

  return (data ?? []).map((row, idx) => {
    const user = row.users as unknown as {
      display_name: string | null;
      avatar_url: string | null;
    } | null;
    const levelInfo = computeLevelFromPoints(configs, row.total_points);

    return {
      rank: offset + idx + 1,
      user_id: row.user_id,
      display_name: user?.display_name ?? null,
      avatar_url: user?.avatar_url ?? null,
      total_points: row.total_points,
      level: row.level,
      level_name: levelInfo.level_name,
    };
  });
}

// ─── getMemberPoints ───
// Get or create member_points row for a user.

export async function getMemberPoints(
  tenantId: string,
  userId: string
): Promise<MemberPointsInfo> {
  const supabase = createAdminClient();

  let { data, error } = await supabase
    .from("member_points")
    .select("total_points, level")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .single();

  // If no row exists, create one with defaults
  if (error || !data) {
    const { data: inserted, error: insertError } = await supabase
      .from("member_points")
      .upsert(
        { tenant_id: tenantId, user_id: userId, total_points: 0, level: 1 },
        { onConflict: "tenant_id,user_id" }
      )
      .select("total_points, level")
      .single();

    if (insertError || !inserted) {
      throw new Error(
        `Failed to get/create member_points: ${insertError?.message ?? "unknown"}`
      );
    }

    data = inserted;
  }

  const configs = await getLevelConfigs(tenantId);
  const levelInfo = computeLevelFromPoints(configs, data.total_points);

  return levelInfo;
}

// ─── getLevelConfigs ───
// Get all level_configs for tenant. If empty, seed defaults.

export async function getLevelConfigs(
  tenantId: string
): Promise<LevelConfig[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("level_configs")
    .select("tenant_id, level, name, min_points, rewards")
    .eq("tenant_id", tenantId)
    .order("level", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch level_configs: ${error.message}`);
  }

  // If no configs exist, seed defaults
  if (!data || data.length === 0) {
    const defaults = DEFAULT_LEVEL_THRESHOLDS.map((t) => ({
      tenant_id: tenantId,
      level: t.level,
      name: t.name,
      min_points: t.min_points,
      rewards: null,
    }));

    const { data: seeded, error: seedError } = await supabase
      .from("level_configs")
      .insert(defaults)
      .select("tenant_id, level, name, min_points, rewards");

    if (seedError) {
      // Fallback to in-memory defaults if insert fails (e.g. race condition)
      return defaults as LevelConfig[];
    }

    return (seeded ?? defaults) as LevelConfig[];
  }

  return data as LevelConfig[];
}

// ─── computeLevelFromPoints ───
// Client-side level computation from configs array.

export function computeLevelFromPoints(
  configs: LevelConfig[],
  points: number
): MemberPointsInfo {
  // Sort by min_points descending to find current level
  const sorted = [...configs].sort((a, b) => b.min_points - a.min_points);

  let currentLevel = sorted[sorted.length - 1]; // fallback to lowest
  for (const config of sorted) {
    if (points >= config.min_points) {
      currentLevel = config;
      break;
    }
  }

  // Find next level (sorted ascending)
  const ascending = [...configs].sort((a, b) => a.min_points - b.min_points);
  const currentIdx = ascending.findIndex(
    (c) => c.level === currentLevel.level
  );
  const nextLevel =
    currentIdx >= 0 && currentIdx < ascending.length - 1
      ? ascending[currentIdx + 1]
      : null;

  return {
    total_points: points,
    level: currentLevel.level,
    level_name: currentLevel.name,
    next_level_name: nextLevel?.name ?? null,
    points_to_next_level: nextLevel
      ? nextLevel.min_points - points
      : null,
  };
}

// ─── awardPoints ───
// Insert a point_event. The DB trigger handles member_points update.
// This is a convenience wrapper for manual/API-level awards.

export async function awardPoints(
  tenantId: string,
  userId: string,
  eventType: PointEventType,
  points: number,
  sourceType?: string,
  sourceId?: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("point_events").insert({
    tenant_id: tenantId,
    user_id: userId,
    event_type: eventType,
    points,
    source_type: sourceType ?? null,
    source_id: sourceId ?? null,
  });

  if (error) {
    throw new Error(`Failed to award points: ${error.message}`);
  }
}
