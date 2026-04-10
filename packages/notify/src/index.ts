/**
 * @saas/notify — 共通インボックス通知パッケージ
 *
 * saas-builder の lib/notifications/inbox.ts を workspace パッケージとして再エクスポート。
 * aria-app / energy-scheduler など downstream プロジェクトからは
 *   import { notify } from '@saas/notify'
 * で利用できる。
 *
 * 依存: @supabase/supabase-js, @/lib/db/supabase/server（各プロジェクトで解決）
 */

export type { NotificationPayload, NotificationProvider, NotificationType } from "../../lib/notifications/inbox";
export {
  createInboxNotification,
  notify,
} from "../../lib/notifications/inbox";
