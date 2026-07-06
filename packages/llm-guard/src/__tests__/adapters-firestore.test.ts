import { describe, it, expect } from "vitest";
import { firestoreUsageStore, usageDocId, type FirestoreLikeDb } from "../adapters/firestore";
import { InMemoryAlertSink } from "../core/alerts";

/**
 * 実 firebase-admin を使わず、runTransaction/collection/doc/get/set の
 * 最小意味論だけを再現するインメモリのフェイク Firestore。
 * このテストは実 Firestore にも実 Claude API にも一切接続しない。
 */
function createFakeFirestore(): FirestoreLikeDb & { readDoc(path: string): Record<string, unknown> | undefined } {
  const store = new Map<string, Record<string, unknown>>();

  return {
    collection(name: string) {
      return {
        doc(id: string) {
          return { id: `${name}/${id}` };
        },
      };
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const tx = {
        async get(ref: { id: string }) {
          const data = store.get(ref.id);
          return { exists: data !== undefined, data: () => data };
        },
        set(ref: { id: string }, data: Record<string, unknown>) {
          store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data });
        },
      };
      return fn(tx);
    },
    readDoc(path: string) {
      return store.get(path);
    },
  };
}

describe("firestoreUsageStore — aria-for-salon-app claude-usage-store.ts 移植の回帰", () => {
  it("上限内なら予約に成功し、Reservation (予約時期間キー付き) が返る", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, {
      dailyTokenLimit: 1000,
      monthlyTokenLimit: 1_000_000,
      now: () => new Date("2026-07-06T12:00:00Z"),
    });

    const reservation = await store.reserve("tenant-a", 300);
    expect(reservation).not.toBeNull();
    expect(reservation!.dailyKey).toBe("2026-07-06");
    expect(reservation!.monthlyKey).toBe("2026-07");
    expect(reservation!.estimatedTokens).toBe(300);
  });

  it("日次上限を超えると予約を拒否し、AlertSinkにscope=dailyで通知する", async () => {
    const db = createFakeFirestore();
    const alertSink = new InMemoryAlertSink();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 100, monthlyTokenLimit: 1_000_000, alertSink });

    expect(await store.reserve("tenant-a", 90)).not.toBeNull();
    expect(await store.reserve("tenant-a", 50)).toBeNull();
    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0].scope).toBe("daily");
  });

  it("release後は再予約できる", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 1000, monthlyTokenLimit: 1000 });
    const r1 = await store.reserve("tenant-a", 600);
    expect(r1).not.toBeNull();
    expect(await store.reserve("tenant-a", 600)).toBeNull();
    await store.release(r1!);
    expect(await store.reserve("tenant-a", 600)).not.toBeNull();
  });

  it("finalize は実測との差分のみを反映する", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 1_000_000, monthlyTokenLimit: 1_000_000 });
    const reservation = await store.reserve("tenant-a", 5000);
    await store.finalize(reservation!, 3247);
    // 再予約して上限との差分から実際の使用量を検証する
    expect(await store.reserve("tenant-a", 1_000_000 - 3247)).not.toBeNull();
    expect(await store.reserve("tenant-a", 1)).toBeNull();
  });

  it("回帰: UTC日境界を跨いだ release は予約日のドキュメントに戻る (Codex review 2026-07-06 P2 on PR #39)", async () => {
    let currentDate = new Date("2026-07-06T23:59:59Z");
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, {
      dailyTokenLimit: 1000,
      monthlyTokenLimit: 1_000_000,
      now: () => currentDate,
    });

    const reservation = await store.reserve("tenant-a", 800);
    expect(reservation).not.toBeNull();

    // 日付が変わってから release
    currentDate = new Date("2026-07-07T00:00:01Z");
    await store.release(reservation!);

    // 予約日 (7/6) のドキュメントが 0 に戻る（残置しない）
    const prevDayDoc = db.readDoc(`llm_usage_daily/${usageDocId("tenant-a", "2026-07-06")}`);
    expect(prevDayDoc?.tokensUsed).toBe(0);
    // 新日 (7/7) のドキュメントは作られていない/汚れていない
    const newDayDoc = db.readDoc(`llm_usage_daily/${usageDocId("tenant-a", "2026-07-07")}`);
    expect(newDayDoc?.tokensUsed ?? 0).toBe(0);
    // 新日はフルに予約できる
    expect(await store.reserve("tenant-a", 1000)).not.toBeNull();
  });

  it("回帰: UTC月境界を跨いだ finalize は予約月のドキュメントに補正される", async () => {
    let currentDate = new Date("2026-07-31T23:59:59Z");
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, {
      dailyTokenLimit: 1_000_000,
      monthlyTokenLimit: 1_000_000,
      now: () => currentDate,
    });

    const reservation = await store.reserve("tenant-a", 5000);
    expect(reservation).not.toBeNull();

    currentDate = new Date("2026-08-01T00:00:05Z");
    await store.finalize(reservation!, 3000);

    const julyDoc = db.readDoc(`llm_usage_monthly/${usageDocId("tenant-a", "2026-07")}`);
    expect(julyDoc?.tokensUsed).toBe(3000);
    const augustDoc = db.readDoc(`llm_usage_monthly/${usageDocId("tenant-a", "2026-08")}`);
    expect(augustDoc?.tokensUsed ?? 0).toBe(0);
  });
});

describe("usageDocId — 固定長ドキュメントID (Codex review 2026-07-06 P2 のFirestore 1500バイト制約対策)", () => {
  it("どんなテナントIDでも40文字の固定長キーを返す", () => {
    const shortId = usageDocId("t1", "2026-07");
    const longId = usageDocId("a".repeat(1500), "2026-07");
    expect(shortId).toHaveLength(32 + 1 + 7);
    expect(longId).toHaveLength(32 + 1 + 7);
  });

  it("同じ入力に対して決定的である", () => {
    expect(usageDocId("tenant-a", "2026-07")).toBe(usageDocId("tenant-a", "2026-07"));
  });

  it("異なるテナントIDは異なるキーになる(スコープ分離)", () => {
    expect(usageDocId("tenant-a", "2026-07")).not.toBe(usageDocId("tenant-b", "2026-07"));
  });
});
