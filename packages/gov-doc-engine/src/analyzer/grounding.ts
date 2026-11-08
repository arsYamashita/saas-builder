import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";
import type { SubsidyExtraction } from "./schema";

/**
 * 数値グラウンディング: Claude が抽出した金額・締切日が、解析元の本文
 * (currentText) に実在する値かを照合する。本文に根拠のない値 (AI の捏造・
 * 桁ミス) を検出し、呼び出し側が confidence を下げて記録できるようにする。
 *
 * 正規化・除外ルールは day_care_web_app の revision_suggester._find_unsourced_numbers
 * とそのテスト (PR #33 scripts/m2_workers/revision_suggester.py) を TS に移植し、
 * Codex レビュー (指示書188 P1/P2) の指摘を反映した。
 *   - HTML→表示テキスト: タグを除き属性値を捨て、インラインタグで割れた本文は
 *     つなぎ直す。ブロック要素の境界には空白を入れて別々の数値を混ぜない。
 *   - 全角→半角: String.prototype.normalize("NFKC")
 *   - 和数字の円換算: "億" "千万" "百万" "万" "千" などの複合単位を円へ展開
 *     ("1億円" -> 100000000 / "1千万円" -> 10000000 / "1.2万円" -> 12000)。
 *     数字と単位のあいだの空白は許すが、空白をまたいで別々の数字は結合しない。
 *   - カンマ除去: "1,000,000" -> 1000000
 *   - 除外: 暦の日付と条・項・号・章・節・款の番号だけを数値抽出の前に消す
 *   - 範囲: 末尾だけに単位を書く "5〜450万円" は、下限にも共有単位 (末尾の
 *     "百万" "千万" 等の単位列全体) を当てて照合する。
 *   - 日付照合: 本文の日付を年月日のトークンへ分解し、ゼロ埋め・空白を除いた
 *     数値の組で比較する (部分一致は禁止)。
 *
 * ReDoS 対策: 可変長の数字パターンを繰り返しの内側で入れ子にしない。数字の桁数は
 * 上限 13 桁 (通貨として十分) に固定し、金額表現の繰り返し境界には必ず単位を置く。
 * これにより純粋な数字列が複数トークンへ指数分割されない。
 */

// 桁数を 13 に制限した数値 (ReDoS 回避。最大 ~10 兆で通貨として十分)。
const NUM = String.raw`\d{1,13}(?:,\d{3})*(?:\.\d{1,10})?`;
const UNIT_CLASS = String.raw`[億万萬千百十]`;
// 1つの金額表現: 先頭の数字(任意) + (空白?単位 空白? 数字?)の1回以上。
// 繰り返しの境界に必ず単位が入るので、数字列が複数 NUM に分割されない (線形)。
const AMOUNT = String.raw`(?:${NUM})?(?:\s*${UNIT_CLASS}\s*(?:${NUM})?)+`;

const NUM_RE = new RegExp(NUM, "g");
const COMPOUND_RE = new RegExp(AMOUNT, "g");
// 「5〜450万円」型の範囲。区切りは NFKC 後の 〜 (U+301C) と ~ (U+007E)。
const RANGE_RE = new RegExp(String.raw`(${NUM})(\s*[〜~]\s*)(${AMOUNT})`, "g");

// 除外規則 (数値抽出の前に本文から消す)。消すのは「暦の日付」と
// 「条・項・号・章・節・款・表の番号」だけ。期間・件数・率は残す。
const DUR = String.raw`(?!間|以内|以上|未満|超|以下)`;
const EXCLUDE_RES: RegExp[] = [
  new RegExp(String.raw`(?:令和|平成|昭和|西暦)?\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日`, "g"),
  new RegExp(String.raw`\d+\s*月\s*\d+\s*日`, "g"),
  new RegExp(String.raw`\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}`, "g"),
  new RegExp(String.raw`(?:令和|平成|昭和|西暦)?\s*\d+\s*年\s*\d+\s*月` + DUR, "g"),
  new RegExp(String.raw`(?:令和|平成|昭和|西暦)\s*\d+\s*年度?`, "g"),
  new RegExp(String.raw`\d{4}\s*年度?` + DUR, "g"),
  new RegExp(String.raw`\d+\s*年度`, "g"),
  new RegExp(String.raw`\d{1,2}\s*月` + DUR, "g"),
  new RegExp(String.raw`第?\s*\d+\s*(?:条|項|号|章|節|款)(?:の\d+)*`, "g"),
  new RegExp(String.raw`第\s*\d+\s*表`, "g"),
  new RegExp(String.raw`(?:別表|附則)\s*第?\s*\d+`, "g"),
  new RegExp(String.raw`§\s*\d+(?:\.\d+)*`, "g"),
  new RegExp(String.raw`(?<![\d.])\d+(?:\.\d+){2,}(?!\d)`, "g"),
];

// インライン要素 (本文を割っているだけ) は境界に空白を入れずつなぎ直す。
// それ以外 (ブロック要素・表のセル等) は境界に空白を入れ、別々の数値を混ぜない。
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "data", "del", "em", "font",
  "i", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong",
  "sub", "sup", "time", "tt", "u", "var", "wbr",
]);

function walkText(node: Node, out: string[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      out.push(child.text);
    } else if (child.nodeType === NodeType.ELEMENT_NODE) {
      const tag = (child as HTMLElement).rawTagName?.toLowerCase() ?? "";
      const inline = INLINE_TAGS.has(tag);
      if (!inline) out.push(" ");
      walkText(child, out);
      if (!inline) out.push(" ");
    }
  }
}

/**
 * HTML を表示テキストへ変換する。属性値は捨て、インラインタグは本文をつなぎ、
 * ブロック境界は空白にする。タグが無い素のテキストはそのまま返る。
 */
function htmlToText(html: string): string {
  if (!html) return "";
  if (!html.includes("<")) return html; // 素のテキストは解析コストを払わない
  const out: string[] = [];
  walkText(parse(html), out);
  return out.join("");
}

/** 整数なら小数点なし、小数なら余分な 0 を落とした文字列。 */
function plain(num: number): string {
  return String(num);
}

// 和数字の単位。BIG は万進法の桁 (億=10^8, 万=10^4)、SMALL は補助桁 (千/百/十)。
const BIG: Record<string, number> = { 億: 1e8, 万: 1e4, 萬: 1e4 };
const SMALL: Record<string, number> = { 千: 1000, 百: 100, 十: 10 };

/**
 * "1億2000万" のような数字と和単位の混在表現を算用数字へ換算する。
 * 万進法を桁ごとに積み上げる標準的な走査。空白・カンマは無視する。
 */
function kanjiToNumber(raw: string): number {
  const s = raw.replace(/[\s,]/g, "");
  let total = 0;
  let section = 0;
  let current = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      current = Number(buf);
      buf = "";
    }
  };
  for (const ch of s) {
    if (/[\d.]/.test(ch)) {
      buf += ch;
      continue;
    }
    flush();
    if (ch in SMALL) {
      if (current === 0) current = 1;
      section += current * SMALL[ch];
      current = 0;
    } else if (ch in BIG) {
      section += current;
      total += section * BIG[ch];
      section = 0;
      current = 0;
    }
  }
  flush();
  return total + section + current;
}

// 換算対象は「和単位を含み、かつ数字か補助桁(千百十)を伴う」表現に限る。
// 単独の "万" "億" (= 数字を伴わない語) を 0 に潰さないためのガード。
function shouldConvert(s: string): boolean {
  return /[億万萬千百十]/.test(s) && (/\d/.test(s) || /[千百十]/.test(s));
}

/**
 * 「5〜450万円」型の範囲で、下限 (数字のみ) に上限末尾の単位列全体を当てて展開する。
 * "5〜450万" -> "50000〜4500000"、"1〜2百万" -> "1000000〜2000000"。
 * 下限が自前の単位を持つ場合 ("5万〜450万") はこの正規表現に当たらない。
 */
function expandRanges(text: string): string {
  return text.replace(RANGE_RE, (m, a: string, sep: string, b: string) => {
    // 上限 b の末尾にある連続した単位列 (百万 / 千万 / 万 / 億 等) を共有単位とする。
    const unitSuffix = b.match(/[億万萬千百十]+$/);
    if (!unitSuffix) return m;
    const low = plain(kanjiToNumber(a + unitSuffix[0]));
    const high = shouldConvert(b) ? plain(kanjiToNumber(b)) : b;
    return `${low}${sep}${high}`;
  });
}

/** 全角→半角 (NFKC) と 和数字の円換算。 */
function normText(text: string): string {
  const ranged = expandRanges(text.normalize("NFKC"));
  return ranged.replace(COMPOUND_RE, (m) => (shouldConvert(m) ? plain(kanjiToNumber(m)) : m));
}

/** 正規化し、暦の日付・条番号・節番号を空白に置き換えたテキスト。 */
function clean(text: string): string {
  let t = normText(text);
  for (const rx of EXCLUDE_RES) t = t.replace(rx, " ");
  return t;
}

/** 本文から検査対象の数値集合を取り出す (暦の日付・条番号・節番号は除外)。 */
function extractNumbers(text: string): Set<number> {
  const out = new Set<number>();
  const cleaned = clean(text);
  for (const m of cleaned.matchAll(NUM_RE)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

// 和暦の元号。base は「西暦 = base + 元号年」。
const GENGO: Array<{ name: string; base: number }> = [
  { name: "令和", base: 2018 },
  { name: "平成", base: 1988 },
  { name: "昭和", base: 1925 },
];

// 本文中の日付表現。年月日を分けて取り、ゼロ埋め・空白を数値化で吸収する。
const GENGO_DATE_RE = new RegExp(
  String.raw`(令和|平成|昭和)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日`,
  "g",
);
const SEIREKI_KANJI_DATE_RE = new RegExp(
  String.raw`(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日`,
  "g",
);
const SEPARATOR_DATE_RE = new RegExp(
  String.raw`(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})`,
  "g",
);

/** 本文に現れる日付を「YYYY-M-D」(ゼロ埋めなし) の集合として取り出す。 */
function extractBodyDates(normBody: string): Set<string> {
  const set = new Set<string>();
  const add = (y: number, m: number, d: number) => {
    if (y && m && d) set.add(`${y}-${m}-${d}`);
  };
  for (const mt of normBody.matchAll(GENGO_DATE_RE)) {
    const g = GENGO.find((x) => x.name === mt[1]);
    if (!g) continue;
    const n = mt[2] === "元" ? 1 : Number(mt[2]);
    add(g.base + n, Number(mt[3]), Number(mt[4]));
  }
  for (const mt of normBody.matchAll(SEIREKI_KANJI_DATE_RE)) {
    add(Number(mt[1]), Number(mt[2]), Number(mt[3]));
  }
  for (const mt of normBody.matchAll(SEPARATOR_DATE_RE)) {
    add(Number(mt[1]), Number(mt[2]), Number(mt[3]));
  }
  return set;
}

/** ISO 日付 (YYYY-MM-DD) が本文中の日付のどれかと年月日で一致するか。 */
function isDateGrounded(iso: string, bodyDates: Set<string>): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  return bodyDates.has(`${y}-${m}-${d}`);
}

/**
 * 本文に根拠の無いフィールド名の配列を返す。
 * 対象は amount.min / amount.max / applicationDeadline.date。null は対象外。
 * 返り値の順序は min, max, date で固定。currentText は HTML を含みうるので
 * 照合前に表示テキストへ変換する。
 */
export function findUnsourcedFields(extraction: SubsidyExtraction, currentText: string): string[] {
  const text = htmlToText(currentText ?? "");
  const bodyNumbers = extractNumbers(text);
  const bodyDates = extractBodyDates(text.normalize("NFKC"));
  const out: string[] = [];

  const { min, max } = extraction.amount;
  if (min != null && !bodyNumbers.has(min)) out.push("amount.min");
  if (max != null && !bodyNumbers.has(max)) out.push("amount.max");

  const date = extraction.applicationDeadline.date;
  if (date != null && !isDateGrounded(date, bodyDates)) out.push("applicationDeadline.date");

  return out;
}
