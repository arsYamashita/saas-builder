# Claude Code: マイグレーション適用 + 初回実行指示

## 前提
- プロジェクト: /Users/masanobuyamashita/saas-builder
- .env.local は設定済み
- npm install は完了済み
- Supabase プロジェクトは作成済み（テーブルはまだ空）

## やること

### Step 1: マイグレーション適用

Supabase Dashboard の SQL Editor で以下ファイルの中身を実行する必要がある。
ファイル: `supabase/all_migrations_combined.sql`

ただし Claude Code からは Supabase SQL Editor にアクセスできないため、
代わりに以下のコマンドで Supabase DB に直接接続して実行すること。

```bash
# Supabase CLI をインストール
npm install -g supabase

# リモートDBに接続してマイグレーション適用
# プロジェクトRef: ujzxysqdmengpekqfqyk
cd /Users/masanobuyamashita/saas-builder

# 方法A: supabase CLI を使う場合
supabase link --project-ref ujzxysqdmengpekqfqyk
supabase db push

# 方法B: supabase CLI が使えない場合
# Supabase Dashboard → SQL Editor → New query
# supabase/all_migrations_combined.sql の中身を貼り付けて Run
```

もし supabase CLI のリンクでパスワードを聞かれたら、
Supabase Dashboard → Settings → Database → Database password に設定したパスワードを使う。

### Step 2: マイグレーション確認

テーブルが作られたか確認:

```bash
# Supabase の REST API で確認
curl -s "https://ujzxysqdmengpekqfqyk.supabase.co/rest/v1/projects?select=id&limit=0" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqenh5c3FkbWVuZ3Bla3FmcXlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkwODQ3NywiZXhwIjoyMDg4NDg0NDc3fQ.0YfZZuHq2tRLeTG-PVHa7n3pO-BVPYbg_pUdOZBOL78" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqenh5c3FkbWVuZ3Bla3FmcXlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkwODQ3NywiZXhwIjoyMDg4NDg0NDc3fQ.0YfZZuHq2tRLeTG-PVHa7n3pO-BVPYbg_pUdOZBOL78"
```

200 + `[]` が返ればテーブルは存在する。
404 なら migration 失敗。

### Step 3: 開発サーバー起動

```bash
cd /Users/masanobuyamashita/saas-builder
npm run dev
```

http://localhost:3000 が開くことを確認。

### Step 4: プロジェクト作成

```bash
curl -s -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SalonCore First Run",
    "summary": "オンラインサロン運営者向けに、会員管理、限定コンテンツ、月額課金、紹介制度をまとめて扱えるSaaS",
    "targetUsers": "小規模から中規模のオンラインサロン運営者",
    "problemToSolve": "会員管理、コンテンツ配信、定期課金、紹介制度が分散していて運営が煩雑",
    "referenceServices": "UTAGE, Circle",
    "brandTone": "modern",
    "templateKey": "membership_content_affiliate",
    "requiredFeatures": ["member_management","content_management","subscription_billing","affiliate_links","admin_dashboard"],
    "managedData": ["members","contents","plans","commissions"],
    "endUserCreatedData": ["profile","comments"],
    "roles": ["owner","admin","member"],
    "billingModel": "subscription",
    "affiliateEnabled": true,
    "visibilityRule": "members_only",
    "mvpScope": ["auth","tenant","roles","content_crud","subscription_billing","affiliate_tracking"],
    "excludedInitialScope": ["advanced_analytics","mobile_app","multi_language","automation_builder"],
    "stackPreference": "Next.js + Supabase + Stripe",
    "notes": "first execution run",
    "priority": "high"
  }' | jq .
```

レスポンスから `project.id` を控える。

### Step 5: テンプレート生成実行

```bash
PROJECT_ID="<Step4で取得したproject.id>"

curl -s -X POST "http://localhost:3000/api/projects/${PROJECT_ID}/generate-template" \
  -H "Content-Type: application/json" | jq .
```

これは時間がかかる（AI APIを複数回呼ぶため）。タイムアウトする場合があるので注意。

### Step 6: 結果確認

```bash
# generation_runs 確認
curl -s "http://localhost:3000/api/projects/${PROJECT_ID}" | jq '.generationRuns'

# qualityRuns 確認
curl -s "http://localhost:3000/api/projects/${PROJECT_ID}" | jq '.qualityRuns'

# generated_files 数を確認
curl -s "http://localhost:3000/api/projects/${PROJECT_ID}" | jq '.generatedFiles | length'
```

### Step 7: 結果記録

以下のフォーマットで結果を報告:

```
Project ID:
Generation Run ID:
Overall Generation Status:
Failed Step:
Error Message:

Step Results:
- blueprint:
- implementation:
- schema:
- api_design:
- split_files:
- export_files:

Saved Counts:
- blueprints:
- implementation_runs:
- generated_files:

Quality:
- lint:
- typecheck:
- playwright:

First real failure point:
Suspected root cause:
```
