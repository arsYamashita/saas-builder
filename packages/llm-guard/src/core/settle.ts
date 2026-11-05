/**
 * LLM 呼び出しが失敗したときの精算。
 *
 * 失敗には2種類ある。
 * - 提供元が HTTP 状態(4xx/5xx)を返して断った失敗: 生成は始まっておらず
 *   課金されない。予約を全額戻してよい(release)。
 * - 状態の無い失敗(時間切れ・通信断・中断・ストリームの途中切れ): 提供元の
 *   側で生成が進み、途中まで課金された可能性がある。予約を戻すとその分が
 *   台帳に載らず、月の上限を超えても止まらない。見込み額のまま確定する
 *   (finalize)。多めに数える側に倒す。
 *
 * 呼び出し元の catch では release を直接呼ばず、必ずこの関数を使う。
 */

import type { Reservation, TenantUsageGuard } from "./reservation";

/** 提供元が HTTP 状態(4xx/5xx)を返した失敗 = 生成は始まっておらず課金されない */
export function isProviderStatusRejection(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 600;
}

/**
 * 呼び出し失敗時の精算。状態付きで断られたら release、
 * 状態の無い失敗(時間切れ・通信断・中断)は見込み額で finalize（多めに数える側に倒す）。
 * 精算の書き込みが失敗しても、元の失敗は呼び出し元がそのまま投げ直すこと。
 */
export async function settleOnFailure(
  guard: Pick<TenantUsageGuard, "finalize" | "release">,
  reservation: Reservation,
  err: unknown,
): Promise<"released" | "finalized_estimate"> {
  if (isProviderStatusRejection(err)) {
    try {
      await guard.release(reservation);
    } catch (settleErr) {
      console.warn("[llm-guard] release failed while settling a rejected call:", settleErr);
    }
    return "released";
  }
  try {
    await guard.finalize(reservation, reservation.estimatedTokens);
  } catch (settleErr) {
    console.warn("[llm-guard] finalize failed while settling a failed call:", settleErr);
  }
  return "finalized_estimate";
}
