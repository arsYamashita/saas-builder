# community_membership_saas v1 — Promotion Checklist

## Pre-promotion (必須)

- [ ] Schema migration (00001_schema.sql) が Supabase に適用済み
- [ ] RLS policies (00002_rls.sql) が Supabase に適用済み
- [ ] Seed data が正常に投入可能
- [ ] Blueprint review_status = approved
- [ ] Generation run: 全 6 step completed
- [ ] Generation run: 全 step review_status = approved
- [ ] Generation run: run review_status = approved
- [ ] Quality gate: lint = passed
- [ ] Quality gate: typecheck = passed
- [ ] Quality gate: playwright = passed

## API 動作確認

- [ ] POST /api/auth/signup — tenant + user + membership 作成成功
- [ ] POST /api/auth/signup — slug 重複で 409
- [ ] POST /api/auth/signup — 途中失敗時に auth user が cleanup される
- [ ] POST /api/auth/login — 正常ログイン + membership 返却
- [ ] POST /api/auth/accept-invite — member として参加成功
- [ ] POST /api/auth/accept-invite — 二重参加で 409
- [ ] GET /api/me — 認証済みユーザー情報 + membership 返却
- [ ] GET /api/public/.../plans — active プランのみ返却
- [ ] GET /api/public/.../contents — 未認証は public のみ、member は全件
- [ ] GET /api/public/.../contents/[slug] — draft は 404、access denied は body=null
- [ ] GET /api/admin/.../contents — editor 以上で draft/archived 含む全件
- [ ] POST /api/admin/.../contents — editor 以上で作成 + audit log 記録
- [ ] POST /api/admin/.../plans — admin 以上で作成 + audit log 記録
- [ ] GET/POST /api/admin/.../members — admin 以上、role escalation 拒否
- [ ] GET/POST /api/admin/.../tags — admin 以上 + audit log 記録
- [ ] POST /api/admin/.../user-tags — assign/remove + audit log 記録
- [ ] POST /api/stripe/checkout/subscription — Stripe session URL 返却
- [ ] POST /api/stripe/checkout/purchase — Stripe session URL 返却
- [ ] POST /api/stripe/webhook — subscription upsert + purchase 冪等
- [ ] GET /api/admin/.../audit-logs — admin 以上、pagination 動作

## Tenant Isolation

- [ ] admin API で他テナントの tenantId を指定 → 403
- [ ] public API で他テナントの slug 指定 → 別テナントのデータ返却なし
- [ ] audit-logs が他テナント分を含まない

## Access Control

- [ ] public content: 未認証ユーザーが public コンテンツを閲覧可
- [ ] members_only: active member のみ body 取得可
- [ ] rules_based + plan_based: active subscription 持ちのみ body 取得可
- [ ] rules_based + purchase_based: completed purchase 持ちのみ body 取得可
- [ ] rules_based + tag_based: 対象タグ持ちのみ body 取得可
- [ ] OR 評価: 複数ルールのうち 1 つ満たせばアクセス可
- [ ] suspended member: published でもアクセス不可

## Role Escalation

- [ ] admin が owner role を付与 → 403
- [ ] editor が admin API を呼び出し → 403
- [ ] member が editor API を呼び出し → 403
- [ ] 未認証が admin API を呼び出し → 401

## Stripe Webhook Idempotency

- [ ] 同一 subscription event の再送 → upsert で冪等
- [ ] 同一 purchase event の再送 → payment_intent_id 重複チェックで skip
- [ ] audit log が二重化しない

## Post-promotion

- [ ] baseline_promotions テーブルにレコード作成
- [ ] baseline tag: baseline/cms-green-v1
- [ ] Scoreboard に community_membership_saas が表示される
