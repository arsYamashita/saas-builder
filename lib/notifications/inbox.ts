import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/supabase/server";

export type NotificationType = 'billing' | 'project' | 'system'

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  metadata?: Record<string, unknown>;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

/** Supabase DB 経由のインボックス通知（全プロジェクト共通） */
export async function createInboxNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id:  payload.userId,
    title:    payload.title,
    message:  payload.message,
    type:     payload.type ?? 'system',
    metadata: payload.metadata,
  });
  if (error) throw new Error(`Notification insert failed: ${error.message}`);
}

/**
 * サーバーサイドから手軽に通知を送る便利ヘルパー。
 *
 * 4th arg は後方互換のため `Record<string, unknown>` も受け付ける。
 * 型を指定したい場合は `{ type: 'billing' | 'project' | 'system', metadata?: ... }` を渡す。
 */
export async function notify(
  userId: string,
  title: string,
  message?: string,
  metadataOrOptions?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();

  // Detect if caller passed new-style options object with a `type` key
  const validTypes: NotificationType[] = ['billing', 'project', 'system']
  const rawType = metadataOrOptions?.type
  const type: NotificationType =
    typeof rawType === 'string' && (validTypes as string[]).includes(rawType)
      ? (rawType as NotificationType)
      : 'system'

  // Strip `type` from metadata so it isn't stored twice
  const { type: _omit, ...restMetadata } = metadataOrOptions ?? {}
  const metadata = Object.keys(restMetadata).length > 0 ? restMetadata : undefined

  await createInboxNotification(supabase, {
    userId,
    title,
    message: message ?? "",
    type,
    metadata,
  });
}
