-- 冪等性・信頼性パック (M2 指示書 2026-07-03_009 項目2):
-- commissions への重複挿入を DB レベルで防ぐ。
--
-- 背景:
-- Stripe webhook は at-least-once delivery のため、同一の
-- customer.subscription.updated / checkout.session.completed イベントが
-- 複数回到達しうる。app/api/stripe/webhook/route.ts の
-- upsertSubscriptionFromStripeSubscription() は commission 挿入前に
-- 既存レコードを SELECT でチェックしているが、これはアプリケーション層の
-- 最適化に過ぎず、並行到達（2つのリクエストがほぼ同時に SELECT を通過する）
-- に対する保護にはならない（check-then-insert は競合状態を防げない —
-- docs/rules/06-api-rules.md, docs/rules/08-db-rules.md 参照）。
-- 真の防御は DB 制約 + ON CONFLICT でなければならない。
-- See [[affiliate_commission_idempotency_missing]].
--
-- (subscription_id, affiliate_id) をキーにする理由:
-- 1つの subscription は1つの affiliate の紹介からしか生まれない
-- （referrals 経由）。この組で一意にすることで、同一アフィリエイトへの
-- 重複コミッション生成を防ぎつつ、subscription_id が null になりうる
-- 将来のコミッション経路（サブスクリプション以外のトリガー）を
-- 誤ってブロックしない（Postgres の UNIQUE 制約は NULL 同士を
-- 別値として扱うため、subscription_id が null の行同士は制約に
-- 引っかからない）。
alter table commissions
  add constraint commissions_subscription_affiliate_unique
  unique (subscription_id, affiliate_id);
