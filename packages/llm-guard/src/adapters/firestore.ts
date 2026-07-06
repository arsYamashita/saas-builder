/**
 * `TenantUsageGuard` の Firestore 実装。
 *
 * 移植元: aria-for-salon-app/functions/src/claude-usage-store.ts
 * (2026-07-06, Codex review 2026-07-06 P2 対応済み設計)。
 *
 * コレクションは `llm_usage_daily` / `llm_usage_monthly` の2本。
 * ドキュメント ID はいずれも `{sha256(tenantId)先頭32hex}_{期間キー}`
 * の固定長キー。
 *
 * scopeId（テナントID）を生のままドキュメント ID に使わない理由
 * (aria-for-salon-app の Codex review 2026-07-06 P2 指摘を踏襲):
 * テナントIDのバリデーションが最大1500バイトを許容する設計はプロダクト側に
 * 複数存在し（例: aria-for-salon-app の tenant-auth.ts）、`{tenantId}_{期間キー}`
 * の生合成だと Firestore のドキュメントID上限 (1500バイト) を超える
 * テナントで path エラー → エージェント実行前に 500 になる。固定長ハッシュ
 * ならどんな有効テナントIDでも必ず収まる。監査・デバッグ用に生の tenantId と
 * 期間キーはドキュメントのフィールドとして保存する。
 *
 * 「読み取り → 日次+月次の両方の上限判定 → 両方に加算」を単一の
 * `runTransaction` 内で原子的に行う。日次・月次どちらか一方でも上限超過なら
 * 両方とも加算しない（部分適用によるカウンタのずれを防止）。Firestore
 * トランザクションは競合時に自動リトライされるため、並行呼び出しでも
 * used の合計が limit を超えることはない
 * (day_care_web_app/functions/src/utils/firestoreAdapters.ts の
 * firestoreUsageStore と同じ設計 — Codex review 2026-07-03 指摘2 対応済みパターン)。
 *
 * finalize/release は Reservation が保持する **予約時の期間キー** の
 * ドキュメントに対して補正する — now() を再計算しない
 * (UTC日/月境界跨ぎの補正ずれ防止, Codex review 2026-07-06 P2 on PR #39)。
 */

import { createHash } from "node:crypto";
import type { AlertSink } from "../core/alerts";
import { DEFAULT_DAILY_TOKEN_LIMIT, DEFAULT_MONTHLY_TOKEN_LIMIT } from "../core/limits";
import {
  applyReservation,
  reservationAdjustment,
  yyyyMM,
  yyyyMMdd,
  type Reservation,
  type TenantUsageGuard,
} from "../core/reservation";

export const LLM_USAGE_DAILY_COLLECTION = "llm_usage_daily";
export const LLM_USAGE_MONTHLY_COLLECTION = "llm_usage_monthly";

/**
 * scopeId + periodKey から固定長のドキュメント ID を作る。
 * sha256 先頭 32 hex (128bit) — 実運用のテナント数規模で衝突確率は無視できる。
 */
export function usageDocId(scopeId: string, periodKey: string): string {
  const hash = createHash("sha256").update(scopeId, "utf8").digest("hex").slice(0, 32);
  return `${hash}_${periodKey}`;
}

/** Firestore への依存を最小インターフェイスに閉じ込める（firebase-admin の型に直接依存しない）。 */
export interface FirestoreLikeTransaction {
  get(ref: FirestoreDocRef): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(ref: FirestoreDocRef, data: Record<string, unknown>, options: { merge: true }): void;
}
export interface FirestoreDocRef {
  readonly id: string;
}
export interface FirestoreLikeCollection {
  doc(id: string): FirestoreDocRef;
}
export interface FirestoreLikeDb {
  collection(name: string): FirestoreLikeCollection;
  runTransaction<T>(fn: (tx: FirestoreLikeTransaction) => Promise<T>): Promise<T>;
}

export interface FirestoreUsageStoreOptions {
  dailyTokenLimit?: number;
  monthlyTokenLimit?: number;
  alertSink?: AlertSink;
  now?: () => Date;
}

/**
 * `TenantUsageGuard` の Firestore アダプタ。`db` は firebase-admin の
 * `Firestore` インスタンスと構造的に互換な最小インターフェイス
 * (`FirestoreLikeDb`) を要求する — 呼び出し側は実際の firebase-admin
 * インスタンスをそのまま渡せる（`runTransaction`/`collection`/`doc`/`get`/`set`
 * のシグネチャは firebase-admin と同一）。
 */
export function firestoreUsageStore(
  db: FirestoreLikeDb,
  options: FirestoreUsageStoreOptions = {},
): TenantUsageGuard {
  const dailyTokenLimit = options.dailyTokenLimit ?? DEFAULT_DAILY_TOKEN_LIMIT;
  const monthlyTokenLimit = options.monthlyTokenLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;
  const now = options.now ?? (() => new Date());
  const alertSink = options.alertSink;

  /**
   * 予約時の期間キー (reservation.dailyKey/monthlyKey) のドキュメントに
   * 対して delta を補正する — now() から期間キーを再計算しない。
   */
  async function adjust(reservation: Reservation, delta: number): Promise<void> {
    if (delta === 0) return;
    const dailyRef = db
      .collection(LLM_USAGE_DAILY_COLLECTION)
      .doc(usageDocId(reservation.tenantId, reservation.dailyKey));
    const monthlyRef = db
      .collection(LLM_USAGE_MONTHLY_COLLECTION)
      .doc(usageDocId(reservation.tenantId, reservation.monthlyKey));

    await db.runTransaction(async (tx) => {
      const [dailyDoc, monthlyDoc] = await Promise.all([tx.get(dailyRef), tx.get(monthlyRef)]);
      const dailyUsed = ((dailyDoc.exists ? dailyDoc.data() : undefined)?.tokensUsed as number) ?? 0;
      const monthlyUsed = ((monthlyDoc.exists ? monthlyDoc.data() : undefined)?.tokensUsed as number) ?? 0;

      tx.set(
        dailyRef,
        {
          tenantId: reservation.tenantId,
          periodKey: reservation.dailyKey,
          tokensUsed: Math.max(0, dailyUsed + delta),
          updatedAt: now().toISOString(),
        },
        { merge: true },
      );
      tx.set(
        monthlyRef,
        {
          tenantId: reservation.tenantId,
          periodKey: reservation.monthlyKey,
          tokensUsed: Math.max(0, monthlyUsed + delta),
          updatedAt: now().toISOString(),
        },
        { merge: true },
      );
    });
  }

  return {
    async reserve(tenantId: string, tokens: number): Promise<Reservation | null> {
      const nowDate = now();
      const dailyKey = yyyyMMdd(nowDate);
      const monthlyKey = yyyyMM(nowDate);
      const dailyRef = db.collection(LLM_USAGE_DAILY_COLLECTION).doc(usageDocId(tenantId, dailyKey));
      const monthlyRef = db.collection(LLM_USAGE_MONTHLY_COLLECTION).doc(usageDocId(tenantId, monthlyKey));

      const { accepted, dailyResult, monthlyResult } = await db.runTransaction(async (tx) => {
        const [dailyDoc, monthlyDoc] = await Promise.all([tx.get(dailyRef), tx.get(monthlyRef)]);
        const dailyUsed = ((dailyDoc.exists ? dailyDoc.data() : undefined)?.tokensUsed as number) ?? 0;
        const monthlyUsed = ((monthlyDoc.exists ? monthlyDoc.data() : undefined)?.tokensUsed as number) ?? 0;

        const dResult = applyReservation(dailyUsed, tokens, dailyTokenLimit);
        const mResult = applyReservation(monthlyUsed, tokens, monthlyTokenLimit);

        if (!dResult.accepted || !mResult.accepted) {
          // 上限超過: どちらのカウンタにも加算しない (部分適用によるずれ防止)。
          return { accepted: false, dailyResult: dResult, monthlyResult: mResult };
        }

        tx.set(
          dailyRef,
          { tenantId, periodKey: dailyKey, tokensUsed: dResult.newUsed, updatedAt: nowDate.toISOString() },
          { merge: true },
        );
        tx.set(
          monthlyRef,
          { tenantId, periodKey: monthlyKey, tokensUsed: mResult.newUsed, updatedAt: nowDate.toISOString() },
          { merge: true },
        );
        return { accepted: true, dailyResult: dResult, monthlyResult: mResult };
      });

      if (!accepted) {
        const scope = !monthlyResult.accepted ? "monthly" : "daily";
        const used = scope === "monthly" ? monthlyResult.newUsed : dailyResult.newUsed;
        const limit = scope === "monthly" ? monthlyTokenLimit : dailyTokenLimit;
        await alertSink?.recordQuotaExceeded({
          tenantId,
          scope,
          used,
          limit,
          estimatedTokens: tokens,
          timestamp: nowDate,
        });
        return null;
      }

      return { tenantId, estimatedTokens: tokens, dailyKey, monthlyKey };
    },

    async finalize(reservation: Reservation, actualTokens: number): Promise<void> {
      const delta = reservationAdjustment(reservation.estimatedTokens, actualTokens);
      await adjust(reservation, delta);
    },

    async release(reservation: Reservation): Promise<void> {
      await adjust(reservation, -reservation.estimatedTokens);
    },
  };
}
