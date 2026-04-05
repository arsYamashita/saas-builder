-- Stripe Webhook べき等性保証テーブル
-- 同一イベントの再送による二重課金・二重プロビジョニングを防ぐ

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'processed'
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- service_role のみ書き込み可能（アプリからは直接アクセスしない）
CREATE POLICY "service_role_only" ON stripe_webhook_events
  USING (false)
  WITH CHECK (false);
