/**
 * Structured Logger
 *
 * Lightweight log-level controlled logger.
 * Level is controlled by LOG_LEVEL env var: debug | info | warn | error (default: info)
 *
 * Usage:
 *   import { createLogger } from "@/lib/utils/logger";
 *   const log = createLogger("factory-intelligence");
 *   log.info("strategy selected", { strategy: "primary" });
 *   log.debug("detailed trace", { data });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = (typeof process !== "undefined" ? process.env?.LOG_LEVEL : undefined) ?? "info";
  if (env in LEVEL_ORDER) return env as LogLevel;
  return "info";
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[getConfiguredLevel()];
  }

  function formatArgs(message: string, data?: Record<string, unknown>): unknown[] {
    if (data && Object.keys(data).length > 0) {
      return [prefix, message, data];
    }
    return [prefix, message];
  }

  return {
    debug(message, data) {
      if (shouldLog("debug")) console.debug(...formatArgs(message, data));
    },
    info(message, data) {
      if (shouldLog("info")) console.log(...formatArgs(message, data));
    },
    warn(message, data) {
      if (shouldLog("warn")) console.warn(...formatArgs(message, data));
    },
    error(message, data) {
      if (shouldLog("error")) console.error(...formatArgs(message, data));
    },
  };
}
