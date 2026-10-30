# Supabase 本番プロジェクト退役（2026-09-28）

外部公開の予定がないため、課金（約$11/月）を止める目的で Supabase プロジェクトを削除した。

- 削除したプロジェクト: `saas-builder`（ref `ujzxysqdmengpekqfqyk`、Tokyo、org inisvvgowmdudogotqwx）
- 削除時点: 実ユーザー 0（テスト用アカウントのみ）・Storage 0件・Edge Functions 0件
- データ退避: M5 `~/Backups/supabase_retired_2026-09-28/saas-builder_ujzxysqdmengpekqfqyk/`（public/auth 全テーブル JSONL＋列定義）

## 影響

- この ref を指す `.env` / GitHub Secrets（`NEXT_PUBLIC_SUPABASE_URL` 等）は無効。DB に触れる CI・E2E は再作成まで失敗する。

## 再作成手順

1. Supabase で新規プロジェクトを作成（Tokyo・Micro）
2. リポジトリのマイグレーションを適用（DB 構造は git が正本）
3. 新しい URL・anon key・service role key・DATABASE_URL を `.env` と GitHub Secrets に差し替え
4. 必要なら退避 JSONL から seed を戻す
