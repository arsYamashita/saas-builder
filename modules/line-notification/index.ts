/**
 * saas-builder/modules/line-notification
 *
 * LINE Messaging API を使った汎用通知モジュール。
 * aria-app (Flutter/Firebase) から設計を移植し、Next.js/Supabase スタック向けに再実装。
 *
 * TODO: aria-for-salon-app / day_care_web_app への展開時はこのモジュールを参照すること
 */

export interface LineNotificationConfig {
  channelAccessToken: string;
  targetType: "customer" | "staff" | "broadcast";
  segmentFilter?: Record<string, unknown>;
}

export interface LineMessage {
  type: "text" | "flex" | "template";
  text?: string;
  altText?: string;
  contents?: unknown;
}

export interface SendResult {
  success: boolean;
  failedIds: string[];
}

/**
 * 指定した LINE ユーザー群にメッセージを送信する。
 * recipients: LINE userId または groupId の配列
 */
export async function sendLineNotification(
  config: LineNotificationConfig,
  recipients: string[],
  message: LineMessage
): Promise<SendResult> {
  const results = await Promise.allSettled(
    recipients.map((userId) =>
      fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.channelAccessToken}`,
        },
        body: JSON.stringify({
          to: userId,
          messages: [message],
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`LINE API error ${res.status}: ${body}`);
        }
        return res;
      })
    )
  );

  const failedIds = results
    .map((r, i) => (r.status === "rejected" ? recipients[i] : null))
    .filter((id): id is string => id !== null);

  return { success: failedIds.length === 0, failedIds };
}

/**
 * ステップ配信をスケジュール登録する（aria-app の Cloud Functions 実装から移植）。
 * Supabase の scheduled_notifications テーブルに登録し、
 * Vercel Cron (/api/cron/line-step) が毎朝チェック・送信する。
 */
export async function scheduleStepDelivery(
  steps: Array<{ delayDays: number; message: LineMessage }>,
  lineUserId: string,
  config: LineNotificationConfig,
  supabaseClient: {
    from: (table: string) => {
      insert: (rows: unknown[]) => Promise<{ error: unknown }>;
    };
  }
): Promise<void> {
  const now = new Date();
  const rows = steps.map((step) => {
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + step.delayDays);
    return {
      line_user_id: lineUserId,
      channel_access_token: config.channelAccessToken,
      message: step.message,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
    };
  });

  const { error } = await supabaseClient.from("scheduled_notifications").insert(rows);
  if (error) {
    throw new Error(`Failed to schedule step delivery: ${JSON.stringify(error)}`);
  }
}

/**
 * 429 Too Many Requests などの一時的エラーを簡易リトライする。
 */
export async function sendWithRetry(
  config: LineNotificationConfig,
  recipients: string[],
  message: LineMessage,
  maxRetries = 3
): Promise<SendResult> {
  let lastResult: SendResult = { success: false, failedIds: recipients };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const targets = attempt === 0 ? recipients : lastResult.failedIds;
    lastResult = await sendLineNotification(config, targets, message);
    if (lastResult.success) break;
    // exponential backoff
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }

  return lastResult;
}
