# Git 履歴パージ手順書テンプレート（filter-repo + キーローテーション + バックアップブランチ削除）

指示書 `2026-07-06_025`（LLMコストガード＋シークレット衛生）対応。

> **これは実行手順のテンプレートであり、実行してよいという許可ではない。**
> **本ドキュメントに書かれたコマンドを実行するのは、社長の明示的な GO が
> あるセッションのみ**（DOCTRINE#1）。`git filter-repo` によるリモート強制
> push・キーローテーション・リモートブランチ削除はいずれも不可逆または
> 影響範囲の大きい操作であり、事前確認なしに自動実行しない。

このテンプレートの実行手順部分は `packages/secret-guard` の
pre-commit/gitleaks（コミット前に止める防御）とは別の防御層 —
**「すでに履歴に入ってしまった秘密情報を除去する」** ための事後対応手順。
シークレット衛生の予防側（pre-commit hook・`.gitignore` 共通テンプレ・
`mask()` API）は `packages/secret-guard/README.md` を参照。**本指示書
（025）のシークレット衛生パートはそちらで実装済みのため、本ドキュメントは
重複実装せず「履歴パージ」の一点に絞る。**

---

## 0. 最重要教訓（ai-business-navigator `SECURITY_ROTATION.md` より, 2026-07-06）

過去に別リポジトリ (`ai-business-navigator`) で実際に起きた事故:

> `main` ブランチの履歴は `git filter-repo` で書き換え済みだったが、
> その際に作成したはずのバックアップブランチ (`backup/pre-filter-*`) が
> **GitHub 上 (origin) に push されたまま残っていた**。結果、
> `main` から到達不能になった漏洩コミットが、リモートのバックアップ
> ブランチ経由で今も fetch 可能なままになっていた —
> 「filter-repo は効いたが、漏洩は事実上続いていた」という状態。

**この教訓から導かれる絶対ルール（本手順に必ず反映すること）:**

1. **バックアップ／mirror clone は絶対にリモート (origin) へ push しない。**
   ローカルディスク（できれば git 管理外のディレクトリ）にのみ置く。
2. もし過去に誤ってリモートへ push してしまったバックアップブランチが
   存在するなら、**キーローテーション完了後**に `git push origin --delete
   <branch>` で削除する（ローテーション前に削除しても「安心材料」にしない
   — 削除前に既にクローン/フォークされていた可能性は消せない）。
3. force push を行う前に、共同作業者全員に通知する。force push 後は
   全員が `git fetch --all` + ローカルブランチの reset が必要
   （書き換え後の履歴に古いクローンは追従できない）。
4. GitHub 側のキャッシュ・フォーク・Actions ログ等に断片が残る可能性が
   あるため、リポジトリ側の削除だけで安心せず、**キーローテーションこそが
   本命の対策**と位置づける。

---

## 1. 前提: 実行前に必ず確認すること

- [ ] 社長の明示的な GO を得ている（対象コミット・対象シークレット・
      実行タイミングを含めて合意済み）
- [ ] 影響を受ける全ブランチ・全 fork・全ローカルクローンの棚卸しが
      完了している（`git branch -a`, `gh api repos/{owner}/{repo}/forks`）
- [ ] 共同作業者全員に事前通知済み（force push のタイミングと、
      その後 `git fetch --all` + reset が必要になる旨）
- [ ] リポジトリが private であることを確認済み（public だった期間が
      あれば、その間は誰でも fetch 可能だった前提で影響範囲を評価する）
- [ ] ローテーション対象のシークレット一覧と再発行手順（セクション3）が
      事前に確定している

---

## 2. 漏洩範囲の確定（実行してよい・読み取り専用）

```sh
# 特定ファイル（例: .env）が過去に存在した全コミットを洗い出す
git log --all --source --oneline -- .env .env.local

# そのコミットが現在の main の祖先かどうか確認
git merge-base --is-ancestor <leaked-commit-sha> main
echo $?   # 0 = ancestor (現在も到達可能), 1 = 非ancestor

# 全ブランチ・全リモート参照から到達可能か確認（バックアップブランチ等
# 経由での残置を検出する — セクション0の事故の再発防止）
git branch -a --contains <leaked-commit-sha>
```

`git merge-base --is-ancestor` が非ancestor (exit 1) でも、
`git branch -a --contains` が何かヒットする場合は要注意
（=「main では消えたがどこかのブランチ経由で今も到達可能」の状態）。

---

## 3. キーローテーション（対象シークレットの再発行）— 人間 GO 必須・実行しない

以下は「再発行が必要なシークレットの一覧を作る」ためのテンプレート。
saas-builder の `lib/env.ts` が要求する env と、各テンプレート
(`templates/*/`) が使う env を棚卸しして埋めること:

| サービス | 変数名 | 優先度 | 再発行手順 |
|----------|--------|--------|-----------|
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | 最優先（RLS 全バイパス権限） | Supabase Dashboard → Project Settings → API → service_role key → Reset |
| Supabase | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 中（公開前提だが念のため） | 同上 |
| Stripe | `STRIPE_SECRET_KEY` | 最優先（課金操作可能） | https://dashboard.stripe.com/apikeys → Roll key |
| Stripe | `STRIPE_WEBHOOK_SECRET` | 高 | Webhook エンドポイント設定画面で再生成 |
| Anthropic | `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` | 高 | https://console.anthropic.com/settings/keys |
| Upstash | `UPSTASH_REDIS_REST_TOKEN` | 中 | Upstash Console → Redis → REST API → Reset token |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | 中 | https://aistudio.google.com/apikey |

ローテーション後は、対象環境（Vercel の各 Environment /
GitHub Actions Secrets）の値を更新すること（実行しない・手順の記録のみ）:

```sh
# 例: Vercel（実行しない）
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production

# 例: GitHub Actions（実行しない）
gh secret set ANTHROPIC_API_KEY --body "<new-key>"
```

---

## 4. git 履歴からの完全除去（`git filter-repo`）— 実行しない・手順のみ

```sh
# 1. バックアップ（force push 前に必ず取る）。
#    ⚠️ セクション0の事故の原因そのもの: このバックアップ/mirror clone は
#    絶対にリモート(origin)へ push しないこと。ローカルディスクの
#    git管理外ディレクトリにのみ置く。
git clone --mirror . ../saas-builder-backup-local-only.git

# 2. filter-repo をインストール（未導入の場合）
#    brew install git-filter-repo  または  pip install git-filter-repo

# 3. filter-repo で対象パスを履歴から除去
#    --invert-paths: 指定パスを含むコミットからそのパスだけを消す
#    （コミット自体は残る。ファイル単位の除去）
git filter-repo --path .env --path .env.local --invert-paths

# 複数パスや高エントロピー文字列そのものを消したい場合は --replace-text も使える:
# echo "sk-ant-actual-leaked-key-here==>***REMOVED***" > /tmp/replacements.txt
# git filter-repo --replace-text /tmp/replacements.txt

# 4. reflog クリア（ローカルの不要オブジェクトを掃除、除去したBlobの完全削除）
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# 5. force push（★事前にセクション1のチェックリストを全て満たしてから)
git push origin --force --all
git push origin --force --tags

# 6. 【最重要・セクション0の教訓】バックアップ/mirror clone をリモートに
#    push していないか再確認し、もし既存の古いバックアップブランチが
#    origin 上に残っていれば、キーローテーション完了後に削除する:
git branch -a | grep -i backup   # ローカルの確認
gh api repos/{owner}/saas-builder/branches --paginate -q '.[].name' | grep -i backup  # リモートの確認
git push origin --delete <backup-branch-name>   # 該当があれば、ローテーション完了後に実行
```

### 実行後、必ず全員へ周知すること

- force push 後、共同作業者は全員 `git fetch --all` を実行し、
  ローカルブランチを新しい履歴に `reset --hard origin/<branch>` する必要が
  ある（リベースされた履歴に古いクローンは追従できない）
- CI/CD（GitHub Actions のキャッシュ等）が古いコミットSHAを参照している
  場合は無効化・再実行が必要になることがある

---

## 5. 完了条件（本ランブックのチェックリスト）

- [ ] キーローテーション完了（セクション3の対象シークレット全て）
- [ ] ローテーション後、Vercel / GitHub Actions Secrets 更新完了
- [ ] `git filter-repo` 実行 + force push 完了
- [ ] 共同作業者全員が `git fetch --all` + reset 完了を報告
- [ ] リモートに残っていたバックアップブランチの削除完了
      （**ローテーション完了より前に安心材料にしない** — ai-business-navigator
      SECURITY_ROTATION.md の教訓）
- [ ] `30_Knowledge/errors/env_secrets_in_git_history.md` の
      resolved フラグを更新
- [ ] 該当プロジェクトの `CLAUDE.md` に「対応済み」の記録を残す

---

## 参考

- `packages/secret-guard/README.md` — 予防層（pre-commit + gitleaks CI +
  `mask()` ランタイムAPI）。本ランブックが扱うのは事後対応（履歴除去）の
  みで、予防層とは別軸。
- `packages/secret-guard/ci/gitleaks.toml` — 高エントロピー文字列検知の
  パターン定義（本ランブックの「対象シークレット洗い出し」の参考になる）
- ai-business-navigator `SECURITY_ROTATION.md`（2026-07-06 作成）— 本
  ランブックの教訓（セクション0）の一次情報源
