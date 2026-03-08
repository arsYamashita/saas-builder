あなたはPostgreSQL設計の専門家です。

目的:
以下のBlueprintから完全なschema.sqlを生成してください。

要件:
- Multi tenant SaaS
- tenants
- users
- tenant_users
- subscriptions
- billing_products
- billing_prices
- affiliates
- referrals
- commissions
- audit_logs
- notifications
- 業種固有テーブルを追加

ルール:
- foreign keys required
- indexes required
- timestamps required
- tenant_id isolation

出力:
1. schema.sql
2. migration notes
3. index explanation

入力:
{{blueprint_normalized_json}}
