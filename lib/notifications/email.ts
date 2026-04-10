/**
 * Email notification module
 * Uses Resend (or SendGrid as fallback) for transactional emails.
 * Set RESEND_API_KEY in environment variables.
 */

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_FROM = process.env.NOTIFICATION_FROM_EMAIL ?? "noreply@saas-builder.app";

/**
 * Send a transactional email via Resend.
 * Falls back to a no-op log in development if RESEND_API_KEY is not set.
 */
export async function sendEmail(payload: EmailPayload): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[notifications/email] RESEND_API_KEY not set — skipping in dev:", payload.subject);
      return { success: true, messageId: "dev-noop" };
    }
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from ?? DEFAULT_FROM,
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[notifications/email] Resend error:", res.status, body);
    return { success: false, error: `Resend API error ${res.status}: ${body}` };
  }

  const data = (await res.json()) as { id: string };
  return { success: true, messageId: data.id };
}

/** Notify a user when their subscription is activated */
export async function sendSubscriptionActivatedEmail(
  email: string,
  tenantName: string
): Promise<NotificationResult> {
  return sendEmail({
    to: email,
    subject: `【${tenantName}】サブスクリプションが有効化されました`,
    html: `
      <h2>サブスクリプション有効化のお知らせ</h2>
      <p>${tenantName} のサブスクリプションが有効化されました。</p>
      <p>引き続きご利用いただきありがとうございます。</p>
    `,
  });
}

/** Notify a user when their subscription is cancelled */
export async function sendSubscriptionCancelledEmail(
  email: string,
  tenantName: string,
  periodEnd: Date
): Promise<NotificationResult> {
  return sendEmail({
    to: email,
    subject: `【${tenantName}】サブスクリプション解約のお知らせ`,
    html: `
      <h2>サブスクリプション解約のお知らせ</h2>
      <p>${tenantName} のサブスクリプションは ${periodEnd.toLocaleDateString("ja-JP")} をもって終了します。</p>
      <p>またのご利用をお待ちしております。</p>
    `,
  });
}
