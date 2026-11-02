-- 登録フローをやり直せる形にする (指示書186)。
--
-- 背景: lib/auth/signup-flow.ts は tenants と tenant_users を別々の INSERT で
-- 作っていた。途中で失敗すると認証ユーザーだけが残り、所属 (tenant_users) の
-- ないユーザーが出来上がる。再登録しても既存チェックがないため二重に作る恐れ
-- もあった。
--
-- 対策: テナント作成と所属追加を 1 つの plpgsql 関数 (= 1 トランザクション) に
-- まとめ、同じ user_id で何度呼んでも結果が同じになるようにする。
--   * 関数の先頭で user_id 単位の advisory lock を取る。同じユーザーの
--     同時呼び出し (二重クリック、リトライ、復旧処理との競合) は直列になる。
--   * lock を取ったあとで、そのユーザーの有効な (status = 'active') 所属を探す。
--     あれば何も作らず、その tenant を返す (created = false)。
--   * 無ければ tenants と tenant_users を作る。どちらかが失敗すれば関数全体が
--     ロールバックされ、孤児テナントは残らない。
--
-- 0016 の create_tenant_with_owner は projects まで作る projects API 専用で、
-- 既存所属の確認もしない。登録では projects を作らないため流用せず、別関数にした。
--
-- 権限: 引数 p_user_id を呼び出し元の auth.uid() と照合できない (service_role では
-- auth.uid() が null)。authenticated / anon が直接呼ぶと他人の owner 所属を作れて
-- しまうので、service_role だけに execute を与える。0016 と同じく、Supabase 固有の
-- ロールは pg_roles に存在するときだけ操作し、素の Postgres でも通るようにする。

create or replace function public.ensure_signup_tenant(
  p_user_id uuid,
  p_name text,
  p_slug text
)
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  owner_user_id uuid,
  plan_type text,
  tenant_status text,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_created boolean := false;
begin
  if p_user_id is null then
    raise exception 'ensure_signup_tenant: p_user_id is required'
      using errcode = 'P0001';
  end if;

  if p_name is null or btrim(p_name) = '' or p_slug is null or btrim(p_slug) = '' then
    raise exception 'ensure_signup_tenant: p_name and p_slug are required'
      using errcode = 'P0001';
  end if;

  -- 同じユーザーの同時呼び出しを直列にする (トランザクション終了で自動解放)。
  perform pg_advisory_xact_lock(hashtextextended('ensure_signup_tenant:' || p_user_id::text, 0));

  select tu.tenant_id
    into v_tenant_id
    from tenant_users tu
   where tu.user_id = p_user_id
     and tu.status = 'active'
   order by tu.joined_at asc nulls last, tu.created_at asc, tu.id asc
   limit 1;

  if v_tenant_id is null then
    begin
      insert into tenants (name, slug, owner_user_id, plan_type, status)
      values (p_name, p_slug, p_user_id, 'starter', 'active')
      returning tenants.id into v_tenant_id;

      insert into tenant_users (tenant_id, user_id, role, status, joined_at)
      values (v_tenant_id, p_user_id, 'owner', 'active', now());

      v_created := true;
    exception
      when others then
        -- 部分的に作った行はこのブロックのエラー伝播でロールバックされる。
        -- 内部の制約名などを呼び出し元へ漏らさないよう、固定の文言で再送出する。
        raise exception 'ensure_signup_tenant: tenant creation failed'
          using errcode = 'P0001';
    end;
  end if;

  return query
  select t.id, t.name, t.slug, t.owner_user_id, t.plan_type, t.status, v_created
    from tenants t
   where t.id = v_tenant_id;
end;
$$;

revoke all on function public.ensure_signup_tenant(uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.ensure_signup_tenant(uuid, text, text)
      from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.ensure_signup_tenant(uuid, text, text)
      from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ensure_signup_tenant(uuid, text, text)
      to service_role;
  end if;
end $$;
