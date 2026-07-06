/**
 * @saas/secret-guard — secret-shape masking with enforced output-route
 * coverage. See README.md for the full design rationale and usage.
 */
export { mask } from "./mask";
export { PATTERNS } from "./patterns";
export type { MaskPattern } from "./patterns";
export {
  registerSink,
  listRegisteredSinks,
  assertAllKindsRegistered,
  ALL_SINK_KINDS,
  _resetRegistryForTests,
} from "./sinks";
export type { SinkKind, SinkRegistration, RegisteredSink } from "./sinks";
