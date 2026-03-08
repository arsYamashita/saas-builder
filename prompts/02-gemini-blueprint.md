あなたはSaaS設計専門のシステムアーキテクトです。
以下のMVP仕様から、マルチテナントSaaSとして実装可能なBlueprintをJSONで出力してください。

前提:
- 共通基盤として Auth / Tenant / Role / Stripe / Affiliate / Audit Log を持つ
- 業種固有部分だけを分離して設計する
- 画面、API、DB、権限、イベントを一貫した形にする
- 曖昧な部分は assumptions に入れる

重要: JSON以外を出力しないでください。markdownコードブロックで囲まないでください。

以下の正確なJSON構造で出力してください:
{
  "product_summary": {
    "name": "サービス名",
    "problem": "解決する課題",
    "target": "ターゲットユーザー",
    "category": "テンプレートカテゴリ"
  },
  "entities": [
    {
      "name": "エンティティ名(単数形、snake_case)",
      "description": "説明",
      "main_fields": [
        {
          "name": "フィールド名",
          "type": "string|integer|boolean|uuid|text|timestamp|jsonb|decimal",
          "required": true,
          "description": "フィールドの説明"
        }
      ]
    }
  ],
  "screens": [
    {
      "name": "画面名(snake_case)",
      "purpose": "画面の目的",
      "role_access": ["owner", "admin", "member"]
    }
  ],
  "roles": [
    {
      "name": "ロール名(小文字)",
      "description": "ロールの説明"
    }
  ],
  "permissions": [
    {
      "role": "ロール名",
      "allowed_actions": ["contents:read", "contents:write"]
    }
  ],
  "billing": {
    "enabled": true,
    "model": "subscription",
    "products": ["プラン名"],
    "notes": "課金に関する備考"
  },
  "affiliate": {
    "enabled": true,
    "commission_type": "percentage",
    "commission_value": 20,
    "notes": "アフィリエイトに関する備考"
  },
  "events": ["イベント名"],
  "kpis": ["KPI名"],
  "assumptions": ["前提条件"],
  "mvp_scope": ["MVPスコープ項目"],
  "future_scope": ["将来スコープ項目"]
}

ロール制限: owner, admin, member のみ使用可能。
エンティティ数: 3-6個に絞る。必要最小限。
画面数: 5-10個に絞る。
簡潔にまとめること。冗長な説明は不要。

仕様:
{{mvp_spec}}
