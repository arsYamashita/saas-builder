import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../logger";

describe("createLogger", () => {
  const originalEnv = process.env.LOG_LEVEL;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalEnv;
    }
  });

  it("creates a logger with module prefix", () => {
    const log = createLogger("test-mod");
    log.info("hello");
    expect(console.log).toHaveBeenCalledWith("[test-mod]", "hello");
  });

  it("includes data object when provided", () => {
    const log = createLogger("m");
    log.info("msg", { key: "val" });
    expect(console.log).toHaveBeenCalledWith("[m]", "msg", { key: "val" });
  });

  it("omits data when empty object", () => {
    const log = createLogger("m");
    log.info("msg", {});
    expect(console.log).toHaveBeenCalledWith("[m]", "msg");
  });

  it("calls correct console method per level", () => {
    process.env.LOG_LEVEL = "debug";
    const log = createLogger("m");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("default level (info) suppresses debug", () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger("m");
    log.debug("should not appear");
    log.info("should appear");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("warn level suppresses info and debug", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger("m");
    log.debug("no");
    log.info("no");
    log.warn("yes");
    log.error("yes");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("error level suppresses everything except error", () => {
    process.env.LOG_LEVEL = "error";
    const log = createLogger("m");
    log.debug("no");
    log.info("no");
    log.warn("no");
    log.error("yes");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("invalid LOG_LEVEL falls back to info", () => {
    process.env.LOG_LEVEL = "invalid_level";
    const log = createLogger("m");
    log.debug("no");
    log.info("yes");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("debug level shows everything", () => {
    process.env.LOG_LEVEL = "debug";
    const log = createLogger("m");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
