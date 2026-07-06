import { describe, it, expect } from "vitest";
import { firestoreUsageStore, usageDocId, type FirestoreLikeDb } from "../adapters/firestore";
import { InMemoryAlertSink } from "../core/alerts";

/**
 * 実 firebase-admin を使わず、runTransaction/collection/doc/get/set の
 * 最小意味論だけを再現するインメモリのフェイク Firestore。
 * このテストは実 Firestore にも実 Claude API にも一切接続しない。
 */
function createFakeFirestore(): FirestoreLikeDb {
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
  };
}

describe("firestoreUsageStore — aria-for-salon-app claude-usage-store.ts 移植の回帰", () => {
  it("上限内なら予約に成功し、両カウンタ(日次/月次)が加算される", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 1000, monthlyTokenLimit: 1_000_000 });

    expect(await store.reserve("tenant-a", 300)).toBe(true);
  });

  it("日次上限を超えると予約を拒否し、AlertSinkにscope=dailyで通知する", async () => {
    const db = createFakeFirestore();
    const alertSink = new InMemoryAlertSink();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 100, monthlyTokenLimit: 1_000_000, alertSink });

    expect(await store.reserve("tenant-a", 90)).toBe(true);
    expect(await store.reserve("tenant-a", 50)).toBe(false);
    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0].scope).toBe("daily");
  });

  it("release後は再予約できる", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 1000, monthlyTokenLimit: 1000 });
    expect(await store.reserve("tenant-a", 600)).toBe(true);
    expect(await store.reserve("tenant-a", 600)).toBe(false);
    await store.release("tenant-a", 600);
    expect(await store.reserve("tenant-a", 600)).toBe(true);
  });

  it("finalize は実測との差分のみを反映する", async () => {
    const db = createFakeFirestore();
    const store = firestoreUsageStore(db, { dailyTokenLimit: 1_000_000, monthlyTokenLimit: 1_000_000 });
    await store.reserve("tenant-a", 5000);
    await store.finalize("tenant-a", 5000, 3247);
    // 再予約して上限との差分から実際の使用量を検証する
    expect(await store.reserve("tenant-a", 1_000_000 - 3247)).toBe(true);
    expect(await store.reserve("tenant-a", 1)).toBe(false);
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
