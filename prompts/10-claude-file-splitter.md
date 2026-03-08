あなたはNext.js SaaSコード生成エンジニアです。

以下の設計出力を、実際に保存可能なファイル単位に分割してください。

ルール:
- 必ずJSON配列で返す
- 各要素は以下の形
{
  "file_category": "...",
  "file_path": "...",
  "language": "...",
  "title": "...",
  "description": "...",
  "content_text": "..."
}
- content_text にはそのファイルの全文を入れる
- markdownの説明文は不要
- JSON以外を出力しない

許可される file_category:
schema
migration
api_route
api_schema
page
component
layout
type
test
config
prompt_output

対象出力:
{{implementation_output}}
