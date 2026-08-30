#!/bin/bash
# integration-gate.sh
# saas-builder → day_care_web_app / aria-for-salon-app 統合前チェックスクリプト
# 使い方: bash scripts/integration-gate.sh
# 4/4 PASS になるまで day_care/aria への統合を開始しないこと

set -e
PASS=0
FAIL=0

echo "=== saas-builder 統合ゲートチェック ==="
echo ""

# 1. Supabase RLS チェック
if grep -r "ENABLE ROW LEVEL SECURITY" supabase/ --include="*.sql" > /dev/null 2>&1; then
  echo "✅ RLS: OK"
  PASS=$((PASS+1))
else
  echo "❌ RLS: 未設定（2026-04-03_013_saas_builder_rls_cross_project_template.md を実行してください）"
  FAIL=$((FAIL+1))
fi

# 2. Stripe Webhook 署名検証チェック
if grep -r "constructEvent" app/ --include="*.ts" > /dev/null 2>&1; then
  echo "✅ Stripe Webhook: OK"
  PASS=$((PASS+1))
else
  echo "❌ Stripe Webhook: 未実装（2026-04-03_034_stripe_webhook_verification_final.md を実行してください）"
  FAIL=$((FAIL+1))
fi

# 3. レート制限チェック
if grep -r "ratelimit\|upstash" app/ --include="*.ts" > /dev/null 2>&1; then
  echo "✅ Rate Limit: OK"
  PASS=$((PASS+1))
else
  echo "❌ Rate Limit: 未実装（2026-04-03_028_nextjs_rate_limit_api_routes.md を実行してください）"
  FAIL=$((FAIL+1))
fi

# 4. Anthropic SDK バージョンチェック
#    注意: 単純な部分文字列一致（*"0.8"*）は 0.9.x/0.10.x/0.100.x以上のような
#    バージョンを誤って「未達」判定するバグがあったため、major.minor を
#    数値比較する方式に修正（0.82.0 は OK、0.110.0 も OK、0.7.x は NG）。
SDK_VERSION=$(node -e "const p=require('./package.json'); console.log(p.dependencies['@anthropic-ai/sdk'] || p.dependencies['anthropic'] || 'not found')" 2>/dev/null || echo "not found")
echo "📦 Anthropic SDK: $SDK_VERSION"
SDK_VERSION_CLEAN=$(echo "$SDK_VERSION" | sed -E 's/^[\^~>=<]*//')
SDK_MAJOR=$(echo "$SDK_VERSION_CLEAN" | cut -d. -f1)
SDK_MINOR=$(echo "$SDK_VERSION_CLEAN" | cut -d. -f2)
if [[ "$SDK_VERSION" != "not found" ]] && [[ "$SDK_MAJOR" =~ ^[0-9]+$ ]] && [[ "$SDK_MINOR" =~ ^[0-9]+$ ]] && { [ "$SDK_MAJOR" -gt 0 ] || [ "$SDK_MINOR" -ge 80 ]; }; then
  echo "✅ SDK バージョン: OK"
  PASS=$((PASS+1))
else
  # 全角記号の直前で変数展開すると macOS 標準 bash(3.2, ja_JP.UTF-8) で
  # 文字化けする既知の癖があるため、変数値のあとに半角スペースを挟む。
  echo "❌ SDK バージョン: 古い（0.80.0 以上が必要、現在: $SDK_VERSION ）"
  FAIL=$((FAIL+1))
fi

echo ""
echo "結果: $PASS/4 通過"
if [ $FAIL -eq 0 ]; then
  echo "🟢 統合ゲート: OPEN（day_care/aria への統合を開始できます）"
else
  echo "🔴 統合ゲート: CLOSED（$FAIL 件の問題を先に修正してください）"
  exit 1
fi
