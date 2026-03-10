# Template Validation Messaging — Minimal Design

## なぜ template-aware messaging が必要か

validation summary は汎用的な不足項目チェックだが、
テンプレごとに「何を入れると良いか」は異なる。
MCA なら課金・アフィリエイト、RSV なら予約対象、CRM なら顧客・案件。
テンプレ固有のヒントを出すことで入力の質が上がる。

## validation ではなく guidance

- submit をブロックしない
- 必須項目の判定は既存の validation summary が行う
- この機能は「おすすめ入力」のヒントを出すだけ
- 条件を満たしていればメッセージは出ない

## テンプレごとの guidance

### membership_content_affiliate
| 条件 | メッセージ |
|------|-----------|
| summary に「会員」「コンテンツ」がない | 会員向けサービスやコンテンツ内容を書くと精度向上 |
| billingModel が subscription/hybrid 以外 | 月額課金前提のテンプレなので課金方式の確認推奨 |
| affiliateEnabled が false | 紹介制度を有効にするとフル活用できる |

### reservation_saas
| 条件 | メッセージ |
|------|-----------|
| summary に「予約」「サービス」がない | 予約対象やサービス内容を書くと精度向上 |
| targetUsers に「店舗」「サロン」「オーナー」がない | 店舗やサービス提供者情報があると具体的な画面生成 |
| requiredFeatures に customer_management がない | 顧客管理を追加すると予約と顧客の紐付けが生成 |

### simple_crm_saas
| 条件 | メッセージ |
|------|-----------|
| summary に「顧客」「営業」「CRM」がない | 顧客管理や営業の目的を書くと精度向上 |
| requiredFeatures に deal_management がない | 案件管理を追加すると商談パイプライン生成 |
| requiredFeatures に task_management がない | タスク管理を追加すると ToDo や期限管理生成 |

## 将来の拡張候補

- **Per-template required fields**: テンプレごとに必須項目を変える
- **Schema-aware hints**: Zod schema からヒントを自動生成
- **Dynamic examples**: テンプレに応じた入力例を表示
- **Catalog 連携**: catalog の coreEntities からヒントを自動導出

## まだやらないこと

- テンプレ別の必須項目変更
- Zod 連携
- 動的な入力例表示
- catalog からの自動導出
