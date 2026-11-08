import { describe, it, expect } from "vitest";
import { findUnsourcedFields } from "./grounding";
import type { SubsidyExtraction } from "./schema";

function extraction(overrides: {
  min?: number | null;
  max?: number | null;
  date?: string | null;
}): SubsidyExtraction {
  return {
    isRelevant: true,
    subsidyName: "テスト補助金",
    targetIndustries: [],
    amount: {
      min: overrides.min ?? null,
      max: overrides.max ?? null,
      unit: "JPY",
      description: null,
    },
    applicationDeadline: { date: overrides.date ?? null, description: null },
    summary: "テスト",
    sourceUrl: "https://example.go.jp/subsidy/",
    confidence: "high",
    unsourcedFields: [],
  };
}

describe("findUnsourcedFields — 金額", () => {
  it("(a) 本文「上限100万円」で AI が 1,000,000,000 を返すと amount.max が外れる", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000_000 }), "補助金の上限100万円")).toEqual([
      "amount.max",
    ]);
  });

  it("本文「上限100万円」で AI が 1,000,000 を返すと外れない", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "補助金の上限100万円")).toEqual([]);
  });

  it("null の金額は照合対象外", () => {
    expect(findUnsourcedFields(extraction({ min: null, max: null }), "数値のない本文")).toEqual([]);
  });

  it("min と max の両方が外れると min, max の順で返す", () => {
    expect(
      findUnsourcedFields(extraction({ min: 999, max: 888 }), "本文に金額の記載なし"),
    ).toEqual(["amount.min", "amount.max"]);
  });

  it("(d) 表記ゆれ「1,000,000円」「１００万円」はどちらも 1,000,000 と一致扱い", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "補助上限は1,000,000円です")).toEqual(
      [],
    );
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "補助上限は１００万円です")).toEqual(
      [],
    );
  });

  it("万+千+端数の複合表記も展開する (1万2千500円 = 12500)", () => {
    expect(findUnsourcedFields(extraction({ max: 12_500 }), "支給は1万2千500円")).toEqual([]);
  });

  it("P2-3 「1億円」から抽出した 100,000,000 は根拠あり", () => {
    expect(findUnsourcedFields(extraction({ max: 100_000_000 }), "補助上限1億円")).toEqual([]);
  });

  it("P2-3 「上限1億円」でも 100,000,000 と一致する", () => {
    expect(findUnsourcedFields(extraction({ max: 100_000_000 }), "上限1億円まで")).toEqual([]);
  });

  it("P2-3 「1千万円」から抽出した 10,000,000 は根拠あり", () => {
    expect(findUnsourcedFields(extraction({ max: 10_000_000 }), "補助上限1千万円")).toEqual([]);
  });

  it("P2-3 「1億2000万円」は 120,000,000 と一致する", () => {
    expect(findUnsourcedFields(extraction({ max: 120_000_000 }), "総額1億2000万円")).toEqual([]);
  });

  it("P2-3 「百万円」は 1,000,000 と一致する", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "上限百万円")).toEqual([]);
  });

  it("P2-4 空白で区切られた数字を連結しない: 「補助率1/2 100万円」は 1,000,000 と一致", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "補助率1/2 100万円")).toEqual([]);
  });

  it("P2-4 「補助率1/2 100万円」から 21,000,000 は作られない (捏造値は外れる)", () => {
    expect(findUnsourcedFields(extraction({ max: 21_000_000 }), "補助率1/2 100万円")).toEqual([
      "amount.max",
    ]);
  });

  it("P2-5 範囲「5〜450万円」は min=50000・max=4500000 の両方が一致", () => {
    expect(
      findUnsourcedFields(extraction({ min: 50_000, max: 4_500_000 }), "補助額は5〜450万円"),
    ).toEqual([]);
  });

  it("P2-5 全角チルダ「5～450万円」でも両端が一致", () => {
    expect(
      findUnsourcedFields(extraction({ min: 50_000, max: 4_500_000 }), "補助額は5～450万円"),
    ).toEqual([]);
  });

  it("本文中の条番号・日付の数字は金額の根拠に使えない", () => {
    // 「第3条」「令和6年度」の 3 や 6 は除外されるため、max:3 は外れる。
    expect(findUnsourcedFields(extraction({ max: 3 }), "第3条 令和6年度の運用")).toEqual([
      "amount.max",
    ]);
  });
});

describe("findUnsourcedFields — 締切日", () => {
  it("(b) ISO 日付が和暦「令和8年12月25日」と一致すると外れない", () => {
    expect(
      findUnsourcedFields(extraction({ date: "2026-12-25" }), "申請は令和8年12月25日まで"),
    ).toEqual([]);
  });

  it("西暦「2026年8月28日」表記と一致する", () => {
    expect(
      findUnsourcedFields(extraction({ date: "2026-08-28" }), "締切は2026年8月28日"),
    ).toEqual([]);
  });

  it("スラッシュ区切り「2026/8/28」表記と一致する", () => {
    expect(findUnsourcedFields(extraction({ date: "2026-08-28" }), "締切 2026/8/28")).toEqual([]);
  });

  it("P2-1 部分一致を禁止する: 本文「2026/8/28」に抽出「2026-08-02」は外れる", () => {
    // 候補「2026/8/2」が「2026/8/28」の部分文字列でも一致させない。
    expect(findUnsourcedFields(extraction({ date: "2026-08-02" }), "締切 2026/8/28")).toEqual([
      "applicationDeadline.date",
    ]);
  });

  it("P2-2 ゼロ埋め「2026年08月28日」でも抽出「2026-08-28」は根拠あり", () => {
    expect(findUnsourcedFields(extraction({ date: "2026-08-28" }), "締切は2026年08月28日")).toEqual(
      [],
    );
  });

  it("P2-2 和暦+空白「令和8年 8月28日」でも抽出「2026-08-28」は根拠あり", () => {
    expect(
      findUnsourcedFields(extraction({ date: "2026-08-28" }), "申請は令和8年 8月28日まで"),
    ).toEqual([]);
  });

  it("本文に無い日付は applicationDeadline.date として外れる", () => {
    expect(
      findUnsourcedFields(extraction({ date: "2026-12-25" }), "申請は令和8年12月1日まで"),
    ).toEqual(["applicationDeadline.date"]);
  });

  it("null の日付は照合対象外", () => {
    expect(findUnsourcedFields(extraction({ date: null }), "日付のない本文")).toEqual([]);
  });
});

describe("findUnsourcedFields — P1 ReDoS 耐性", () => {
  it("P1 32桁の悪意ある入力でも短時間で終わる (指数的バックトラッキングなし)", () => {
    const malicious = "1〜" + "9".repeat(32) + "円";
    const start = performance.now();
    const result = findUnsourcedFields(extraction({ max: 12345 }), malicious);
    const elapsedMs = performance.now() - start;
    // 旧実装は 2 秒超。線形化後は数ミリ秒で終わる。余裕をみて 1 秒を上限にする。
    expect(elapsedMs).toBeLessThan(1000);
    expect(result).toEqual(["amount.max"]);
  });

  it("P1 複数の悪意ある範囲が並んでも破綻しない", () => {
    const malicious = ("1〜" + "9".repeat(28) + "円 ").repeat(20);
    const start = performance.now();
    findUnsourcedFields(extraction({ max: 1 }), malicious);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("findUnsourcedFields — P2 HTML の表示テキスト化", () => {
  it("P2 インラインタグで割れた「上限<span>100</span>万円」は 1,000,000 と一致", () => {
    expect(
      findUnsourcedFields(extraction({ max: 1_000_000 }), "上限<span>100</span>万円"),
    ).toEqual([]);
  });

  it("P2 数字を割るタグ「1<span>00</span>万円」も 1,000,000 と一致", () => {
    expect(
      findUnsourcedFields(extraction({ max: 1_000_000 }), "1<span>00</span>万円"),
    ).toEqual([]);
  });

  it("P2 属性値 data-id=\"999999\" は本文に数えない (捏造値は外れる)", () => {
    expect(
      findUnsourcedFields(extraction({ max: 999_999 }), '<div data-id="999999">上限100万円</div>'),
    ).toEqual(["amount.max"]);
  });

  it("P2 属性に紛れていても正しい 1,000,000 は一致する", () => {
    expect(
      findUnsourcedFields(extraction({ max: 1_000_000 }), '<div data-id="999999">上限100万円</div>'),
    ).toEqual([]);
  });

  it("P2 ブロック要素の境界は別々の数値として扱う (セル連結で捏造しない)", () => {
    // <td>5</td><td>450万円</td> を "5450万"(=54,500,000) に連結しない。
    const body = "<table><tr><td>5</td><td>450万円</td></tr></table>";
    expect(findUnsourcedFields(extraction({ max: 54_500_000 }), body)).toEqual(["amount.max"]);
    expect(findUnsourcedFields(extraction({ max: 4_500_000 }), body)).toEqual([]);
  });
});

describe("findUnsourcedFields — P2 範囲の共有単位・空白", () => {
  it("P2 「1〜2百万円」は下限 1,000,000・上限 2,000,000 の両方が一致", () => {
    expect(
      findUnsourcedFields(extraction({ min: 1_000_000, max: 2_000_000 }), "補助額は1〜2百万円"),
    ).toEqual([]);
  });

  it("P2 「1〜2百万円」で下限に末尾1字だけ当てた旧挙動の 10,000 は作られない", () => {
    expect(
      findUnsourcedFields(extraction({ min: 10_000 }), "補助額は1〜2百万円"),
    ).toEqual(["amount.min"]);
  });

  it("P2 数字と単位のあいだの空白「上限100 万円」も 1,000,000 と一致", () => {
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "上限100 万円")).toEqual([]);
  });

  it("P2 空白をまたいだ別々の数字「補助率1/2 100万円」は連結しない", () => {
    // 1,000,000 は一致、捏造の 2,100,000 相当は作られない。
    expect(findUnsourcedFields(extraction({ max: 1_000_000 }), "補助率1/2 100万円")).toEqual([]);
    expect(findUnsourcedFields(extraction({ max: 21_000_000 }), "補助率1/2 100万円")).toEqual([
      "amount.max",
    ]);
  });
});
