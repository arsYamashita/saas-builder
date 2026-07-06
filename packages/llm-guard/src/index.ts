// @saas/llm-guard — 共通 LLM ガバナンスモジュール。
// 指示書 2026-07-06_025 (コストガード) + 2026-07-06_031 (モデルID共通化+
// サイレント劣化ガード) の統合実装。詳細は README.md 参照。

export {
  DEFAULT_DAILY_TOKEN_LIMIT,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  DEFAULT_ESTIMATED_TOKENS_PER_REQUEST,
  DEFAULT_LIMITS,
  type UsageLimits,
} from "./core/limits";

export {
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  yyyyMM,
  yyyyMMdd,
  type Reservation,
  type ReservationResult,
  type TenantUsageGuard,
  type InMemoryTenantUsageGuardOptions,
} from "./core/reservation";

export {
  InMemoryAlertSink,
  ConsoleAlertSink,
  type AlertSink,
  type QuotaExceededEvent,
} from "./core/alerts";

export { checkAndReserveUsage, type UsageCheckResult } from "./core/quota-guard";

export {
  MODELS,
  assertValidModel,
  resolveModelFromEnv,
  UnknownModelError,
  type ModelId,
  type ModelRole,
} from "./core/models";

export {
  firestoreUsageStore,
  usageDocId as firestoreUsageDocId,
  LLM_USAGE_DAILY_COLLECTION,
  LLM_USAGE_MONTHLY_COLLECTION,
  type FirestoreUsageStoreOptions,
  type FirestoreLikeDb,
} from "./adapters/firestore";

export {
  supabaseUsageStore,
  type SupabaseUsageStoreOptions,
  type SupabaseRpcClient,
} from "./adapters/supabase";
