#!/usr/bin/env tsx
/**
 * saas-builder X ローンチ告知コンテンツ生成スクリプト
 *
 * 使い方:
 *   npm run generate:x-posts
 *
 * 出力: scripts/x-launch-content/output/posts.json
 *       scripts/x-launch-content/output/posts-by-category.json
 *       scripts/x-launch-content/output/posts-preview.txt
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_PATH = path.join(__dirname, "templates.yaml");
const OUTPUT_DIR = path.join(__dirname, "output");
const MAX_TWEET_LENGTH = 280;

// 変数置換マップ（{product_url} 等）
const VARIABLES: Record<string, string> = {
  product_url: "https://saas-builder.jp",
  trial_url: "https://saas-builder.jp/trial",
  demo_url: "https://saas-builder.jp/demo",
  partner_url: "https://saas-builder.jp/partner",
};

interface PostTemplate {
  id: string;
  category: string;
  title: string;
  body_template: string;
  hashtags: string[];
  scheduled_at?: string;
  scheduled_day?: number;
}

interface TemplatesFile {
  posts: PostTemplate[];
}

interface GeneratedPost {
  id: string;
  category: string;
  title: string;
  text: string;
  charCount: number;
  withinLimit: boolean;
  hashtags: string[];
  scheduled_at?: string;
  scheduled_day?: number;
}

function substituteVariables(template: string): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return VARIABLES[key] ?? match;
  });
}

function buildPostText(template: PostTemplate): string {
  const body = substituteVariables(template.body_template);
  const hashtagStr = template.hashtags.map((h) => `#${h}`).join(" ");
  return `${body}\n\n${hashtagStr}`;
}

function countChars(text: string): number {
  // X の文字数カウント（日本語・絵文字は標準的な codePoint 数で計算）
  return [...text].length;
}

function validatePost(post: GeneratedPost): string[] {
  const errors: string[] = [];
  if (post.charCount > MAX_TWEET_LENGTH) {
    errors.push(
      `文字数超過: ${post.charCount}文字 (上限 ${MAX_TWEET_LENGTH}文字)`
    );
  }
  if (!post.scheduled_at && post.scheduled_day === undefined) {
    errors.push("scheduled_at または scheduled_day が未設定");
  }
  return errors;
}

function main() {
  console.log("X ローンチ告知コンテンツ生成開始...\n");

  if (!fs.existsSync(TEMPLATES_PATH)) {
    console.error(`テンプレートファイルが見つかりません: ${TEMPLATES_PATH}`);
    process.exit(1);
  }

  const templatesContent = fs.readFileSync(TEMPLATES_PATH, "utf-8");
  const data = yaml.load(templatesContent) as TemplatesFile;

  if (!data?.posts || !Array.isArray(data.posts)) {
    console.error("テンプレートファイルの形式が不正です（posts 配列が必要）");
    process.exit(1);
  }

  const templates = data.posts;
  console.log(`テンプレート読み込み完了: ${templates.length}本\n`);

  const posts: GeneratedPost[] = templates.map((template) => {
    const text = buildPostText(template);
    const charCount = countChars(text);
    return {
      id: template.id,
      category: template.category,
      title: template.title,
      text,
      charCount,
      withinLimit: charCount <= MAX_TWEET_LENGTH,
      hashtags: template.hashtags,
      scheduled_at: template.scheduled_at,
      scheduled_day: template.scheduled_day,
    };
  });

  let hasError = false;
  posts.forEach((post) => {
    const errors = validatePost(post);
    if (errors.length > 0) {
      console.error(`[${post.id}] ${post.title}`);
      errors.forEach((e) => console.error(`   -> ${e}`));
      hasError = true;
    }
  });

  if (hasError) {
    console.error(
      "\nバリデーションエラーがあります。templates.yaml を修正してください。"
    );
    process.exit(1);
  }

  console.log("全投稿バリデーション OK\n");

  const byCategory: Record<string, GeneratedPost[]> = {};
  posts.forEach((post) => {
    if (!byCategory[post.category]) byCategory[post.category] = [];
    byCategory[post.category].push(post);
  });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "posts.json"),
    JSON.stringify(posts, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "posts-by-category.json"),
    JSON.stringify(byCategory, null, 2),
    "utf-8"
  );

  let preview = `# saas-builder X ローンチ告知コンテンツ プレビュー\n`;
  preview += `生成日時: ${new Date().toLocaleString("ja-JP")}\n`;
  preview += `合計: ${posts.length}本\n\n`;

  Object.entries(byCategory).forEach(([category, categoryPosts]) => {
    preview += `${"=".repeat(50)}\n## ${category} (${categoryPosts.length}本)\n${"=".repeat(50)}\n\n`;
    categoryPosts.forEach((postItem, index) => {
      preview += `### ${index + 1}. [${postItem.id}] ${postItem.title}\n`;
      if (postItem.scheduled_at) {
        preview += `日時: ${postItem.scheduled_at}\n`;
      }
      if (postItem.scheduled_day !== undefined) {
        preview += `ローンチ後: ${postItem.scheduled_day}日目\n`;
      }
      preview += `文字数: ${postItem.charCount}文字 / ${MAX_TWEET_LENGTH}文字\n---\n`;
      preview += `${postItem.text}\n\n`;
    });
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "posts-preview.txt"),
    preview,
    "utf-8"
  );

  console.log("生成結果サマリー:");
  console.log("-".repeat(40));
  Object.entries(byCategory).forEach(([category, categoryPosts]) => {
    console.log(`  ${category}: ${categoryPosts.length}本`);
  });
  console.log("-".repeat(40));
  console.log(`  合計: ${posts.length}本\n`);

  const avgChars = Math.round(
    posts.reduce((sum, p) => sum + p.charCount, 0) / posts.length
  );
  console.log(`文字数統計:`);
  console.log(`  平均: ${avgChars}文字`);
  console.log(`  最大: ${Math.max(...posts.map((p) => p.charCount))}文字`);
  console.log(`  最小: ${Math.min(...posts.map((p) => p.charCount))}文字`);
  console.log(`  上限: ${MAX_TWEET_LENGTH}文字\n`);
  console.log(`出力先: ${OUTPUT_DIR}/`);
  console.log("X ローンチ告知コンテンツ生成が完了しました！");
}

main();
