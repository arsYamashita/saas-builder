-- =============================================================================
-- @saas/llm-guard — Supabase (Postgres) 参照スキーマ・テンプレート
--
-- 移植元: ai-business-navigator/supabase/migrations/20260706000000_add_api_usage_limits.sql
-- (`reserve_api_usage` / `adjust_api_usage`, Codex review 2026-07-06 P2
-- 「read-check-insert の TOCTOU」指摘対応済みの ON CONFLICT アトミック予約)。
--
-- これはテンプレートであり、このファイル自体をそのまま migrations に
-- コピーして適用することを想定していない（プロジェクトごとに
-- auth.users への外部キー有無・RLS ポリシー・カラム名を調整すること）。
-- 日次+月次の2カウンタを1回のRPC呼び出しでアトミックに判定・加算する点が
-- navigator 版（月次のみ）からの拡張。
--
-- 上限値は仮置き。実際のコスト許容量に基づくプロダクト判断は人間が別途行う
-- こと（packages/llm-guard/src/core/limits.ts の DEFAULT_DAILY_TOKEN_LIMIT /
-- DEFAULT_MONTHLY_TOKEN_LIMIT と揃えておくと運用上わかりやすい）。
-- =============================================================================

create table if not exists public.llm_usage_daily (
  tenant_id   uuid not null,
  provider    text not null check (provider in ('claude', 'groq', 'gemini', 'openai')),
  day         date not null,               -- 当日 (UTC)
  used_tokens integer not null default 0 check (used_tokens >= 0),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, provider, day)
);

create table if not exists public.llm_usage_monthly (
  tenant_id   uuid not null,
  provider    text not null check (provider in ('claude', 'groq', 'gemini', 'openai')),
  month       date not null,               -- 当月1日 (UTC)
  used_tokens integer not null default 0 check (used_tokens >= 0),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, provider, month)
);

alter table public.llm_usage_daily enable row level security;
alter table public.llm_usage_monthly enable row level security;

-- テナントは自分の使用量のみ閲覧可。書き込みは SECURITY DEFINER 関数経由のみ。
-- `tenant_id = auth.uid()` はユーザー単位テナントの例 — 組織/テナントテーブルを
-- 別途持つ場合は適宜 JOIN や tenant_members 参照に置き換えること。
drop policy if exists "tenants can view own daily usage" on public.llm_usage_daily;
create policy "tenants can view own daily usage"
  on public.llm_usage_daily for select
  using (tenant_id = auth.uid());

drop policy if exists "tenants can view own monthly usage" on public.llm_usage_monthly;
create policy "tenants can view own monthly usage"
  on public.llm_usage_monthly for select
  using (tenant_id = auth.uid());

-- ── アトミック予約関数（日次+月次を単一トランザクションで判定） ──────────────
-- 戻り値: jsonb {accepted, scope, used, limit}
--   accepted = true  → p_tokens 分を日次・月次の両方に予約できた
--   accepted = false → いずれかの軸で上限超過のため予約を拒否（両カウンタとも
--                       加算しない）。scope は超過した軸 ("daily" | "monthly")。
--                       両方超過している場合は "monthly" を優先して報告する。
-- 期間キー (p_day / p_month) はクライアント (@saas/llm-guard アダプタ) が
-- 予約時に確定して渡す (Codex review 2026-07-06 P2 on PR #39):
-- DB 側で now() から再計算すると、UTC日/月境界を跨いだ adjust_llm_usage の
-- 補正が新しいバケットに当たり、前日の予約が残置 + 新日がマイナス補正になる。
-- Reservation (TS側) が予約時のキーを保持し、補正 RPC にも同じキーを渡す。
-- p_month は当月1日 (例 '2026-07-01')。
create or replace function public.reserve_llm_usage(
  p_tenant_id    uuid,
  p_provider     text,
  p_tokens       integer,
  p_daily_limit  integer,
  p_monthly_limit integer,
  p_day          date,
  p_month        date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   date := p_day;
  v_month date := p_month;
  v_daily_used   integer;
  v_monthly_used integer;
begin
  if p_tokens is null or p_tokens <= 0
     or p_daily_limit is null or p_tokens > p_daily_limit
     or p_monthly_limit is null or p_tokens > p_monthly_limit
     or p_day is null or p_month is null then
    return jsonb_build_object('accepted', false, 'scope', 'monthly', 'used', 0, 'limit', coalesce(p_monthly_limit, 0));
  end if;

  -- 行が無ければ 0 で作成しておく（加算ではなく存在保証のみ。すでに行がある
  -- 場合は on conflict do nothing で無視する）。
  insert into public.llm_usage_daily (tenant_id, provider, day, used_tokens)
    values (p_tenant_id, p_provider, v_day, 0)
    on conflict (tenant_id, provider, day) do nothing;
  insert into public.llm_usage_monthly (tenant_id, provider, month, used_tokens)
    values (p_tenant_id, p_provider, v_month, 0)
    on conflict (tenant_id, provider, month) do nothing;

  -- 行ロックを取りながら現在値を読む。関数呼び出し全体が単一トランザクション
  -- として実行される（plpgsql 関数は途中で commit できない）ため、
  -- ここでの FOR UPDATE ロックは reserve() の呼び出し全体を通して保持され、
  -- 同一 (tenant_id, provider) への並行呼び出しは直列化される
  -- (= 旧 read-check-insert 方式の TOCTOU レースが起きない)。
  -- ロック順序は daily → monthly に固定し、デッドロックを避ける。
  select used_tokens into v_daily_used
    from public.llm_usage_daily
    where tenant_id = p_tenant_id and provider = p_provider and day = v_day
    for update;

  select used_tokens into v_monthly_used
    from public.llm_usage_monthly
    where tenant_id = p_tenant_id and provider = p_provider and month = v_month
    for update;

  if v_monthly_used + p_tokens > p_monthly_limit then
    return jsonb_build_object('accepted', false, 'scope', 'monthly', 'used', v_monthly_used, 'limit', p_monthly_limit);
  end if;

  if v_daily_used + p_tokens > p_daily_limit then
    return jsonb_build_object('accepted', false, 'scope', 'daily', 'used', v_daily_used, 'limit', p_daily_limit);
  end if;

  update public.llm_usage_daily
    set used_tokens = used_tokens + p_tokens, updated_at = now()
    where tenant_id = p_tenant_id and provider = p_provider and day = v_day;

  update public.llm_usage_monthly
    set used_tokens = used_tokens + p_tokens, updated_at = now()
    where tenant_id = p_tenant_id and provider = p_provider and month = v_month;

  return jsonb_build_object('accepted', true, 'scope', null, 'used', v_daily_used + p_tokens, 'limit', p_daily_limit);
end;
$$;

-- ── 予約補正関数（成功後の実測補正 / 失敗時の予約返却の両方に使う） ───────────
-- delta = 実測 - 予約 (finalize) または delta = -予約 (release)。
-- 上限チェックは行わない（実測が予約を上回った場合も事実として記録し、
-- 超過分は次回の予約が拒否されることで回収される — navigator 版と同じ方針）。
-- p_day / p_month は **予約時の期間キー** をそのまま渡すこと
-- (Codex review 2026-07-06 P2 on PR #39): DB 側で now() から再計算すると
-- UTC日/月境界を跨いだ補正が新バケットに当たる（前日の予約残置 + 新日の
-- マイナス補正 — greatest(0) にクランプされてずれが黙って揉み消される）。
create or replace function public.adjust_llm_usage(
  p_tenant_id uuid,
  p_provider  text,
  p_delta     integer,
  p_day       date,
  p_month     date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   date := p_day;
  v_month date := p_month;
begin
  if p_delta is null or p_delta = 0 or p_day is null or p_month is null then
    return;
  end if;

  insert into public.llm_usage_daily as d (tenant_id, provider, day, used_tokens)
    values (p_tenant_id, p_provider, v_day, greatest(0, p_delta))
    on conflict (tenant_id, provider, day) do update
      set used_tokens = greatest(0, d.used_tokens + p_delta), updated_at = now();

  insert into public.llm_usage_monthly as m (tenant_id, provider, month, used_tokens)
    values (p_tenant_id, p_provider, v_month, greatest(0, p_delta))
    on conflict (tenant_id, provider, month) do update
      set used_tokens = greatest(0, m.used_tokens + p_delta), updated_at = now();
end;
$$;

-- SECURITY DEFINER 関数はデフォルトで PUBLIC に EXECUTE が付与されるため
-- 明示的に剥奪。予約・補正は Edge Function (service_role) のみが実行できる。
revoke execute on function public.reserve_llm_usage(uuid, text, integer, integer, integer, date, date) from public, anon, authenticated;
revoke execute on function public.adjust_llm_usage(uuid, text, integer, date, date) from public, anon, authenticated;
grant execute on function public.reserve_llm_usage(uuid, text, integer, integer, integer, date, date) to service_role;
grant execute on function public.adjust_llm_usage(uuid, text, integer, date, date) to service_role;

create index if not exists llm_usage_daily_tenant_idx on public.llm_usage_daily (tenant_id, provider, day desc);
create index if not exists llm_usage_monthly_tenant_idx on public.llm_usage_monthly (tenant_id, provider, month desc);
