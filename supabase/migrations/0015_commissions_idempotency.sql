-- ⚠️ 本ファイルは旧 0013_commissions_idempotency.sql のリネーム（内容無変更）。
-- 理由: 0014(スキーマ復元) が commissions テーブルを作るため、0013 のままだと
-- 番号順適用で relation not found になる。本番(ujzxysqdmengpekqfqyk)は 0013 未適用を
-- migration list で実測確認済み(2026-07-06)のためリネームは安全。
-- もし旧 0013 を適用済みの環境がある場合の修復手順:
--   supabase migration repair --status reverted 0013
--   その後 db push（0014 は冪等・0015 は UNIQUE 既存なら no-op）
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
--
-- このマイグレーション全体は冪等（再実行安全）に書かれている。
-- 途中で失敗して再適用されても、バックアップの二重挿入・制約の二重付与は
-- 起きない。

-- ── Step 1: バックアップテーブル（監査用） ──────────────────────
-- まさにこの KB の症状（webhook 二重到達による重複コミッション =
-- アフィリエイターへの過払い）が既に本番で起きていた場合、既存の
-- 重複行があると UNIQUE 制約の付与自体が失敗する（Codex P2 指摘）。
-- 単に DELETE すると過払いの実態調査ができなくなるため、削除対象を
-- まずこのテーブルへ退避する。過払い額の集計・返金調査はこのテーブル
-- に対して行える。調査完了後に手動で DROP してよい。
create table if not exists commissions_duplicates_backup (
  like commissions,
  backed_up_at timestamptz not null default now()
);

-- 再実行時の ON CONFLICT 用に id を一意化（LIKE は PK をコピーしない）。
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_duplicates_backup_pkey'
  ) then
    alter table commissions_duplicates_backup add primary key (id);
  end if;
end $$;

-- docs/rules/08: マイグレーションで作る全テーブルは RLS 必須。
-- コミッション（金額・テナント情報）を含むため、anon/authenticated からの
-- PostgREST 直接アクセスを遮断する。アプリは service-role 経由のみ
-- （0012_enable_rls_tenant_isolation.sql と同じ defense-in-depth 方針。
-- ポリシーを一切定義しないことで全コマンド暗黙 deny）。
alter table commissions_duplicates_backup enable row level security;

-- ── Step 2: 重複行の退避 → 削除 ─────────────────────────────────
-- 同一 (subscription_id, affiliate_id) ペアの重複は「最古の1行」
-- （created_at 昇順、同時刻なら id 昇順）を残し、2行目以降を削除対象と
-- する。最古を残すのは、最初の webhook 到達で作られた行が正であり、
-- 2回目以降の到達で作られた行が本 KB の言う重複だから。
with ranked as (
  select
    id,
    row_number() over (
      partition by subscription_id, affiliate_id
      order by created_at asc, id asc
    ) as rn
  from commissions
  where subscription_id is not null
)
insert into commissions_duplicates_backup
select c.*, now()
from commissions c
join ranked r on r.id = c.id
where r.rn > 1
on conflict (id) do nothing;

with ranked as (
  select
    id,
    row_number() over (
      partition by subscription_id, affiliate_id
      order by created_at asc, id asc
    ) as rn
  from commissions
  where subscription_id is not null
)
delete from commissions
where id in (select id from ranked where rn > 1);

-- ── Step 3: UNIQUE 制約付与（冪等） ─────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_subscription_affiliate_unique'
  ) then
    alter table commissions
      add constraint commissions_subscription_affiliate_unique
      unique (subscription_id, affiliate_id);
  end if;
end $$;
