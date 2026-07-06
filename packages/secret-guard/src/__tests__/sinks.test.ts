import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSink,
  listRegisteredSinks,
  assertAllKindsRegistered,
  ALL_SINK_KINDS,
  _resetRegistryForTests,
} from "../sinks";

describe("registerSink() / sink registry", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it("returns a mask()-backed function usable at the call site", () => {
    const maskIt = registerSink({ kind: "log", name: "test-call-site" });
    const out = maskIt("token=" + "a".repeat(32));
    expect(out).not.toContain("a".repeat(32));
  });

  it("records the registration for later coverage checks", () => {
    registerSink({ kind: "log", name: "test-call-site" });
    const sinks = listRegisteredSinks();
    expect(sinks).toHaveLength(1);
    expect(sinks[0]).toMatchObject({ kind: "log", name: "test-call-site" });
  });

  it("throws on duplicate (kind, name) registration", () => {
    registerSink({ kind: "log", name: "dup" });
    expect(() => registerSink({ kind: "log", name: "dup" })).toThrow(
      /already registered/
    );
  });

  it("allows the same name under a different kind (kind is part of the identity)", () => {
    registerSink({ kind: "log", name: "shared-name" });
    expect(() =>
      registerSink({ kind: "http_response", name: "shared-name" })
    ).not.toThrow();
  });

  describe("assertAllKindsRegistered() — the 未登録経路検出 (undetected-route) test", () => {
    it("throws listing every missing kind when nothing is registered", () => {
      expect(() => assertAllKindsRegistered()).toThrow(
        new RegExp(ALL_SINK_KINDS.join(".*"))
      );
    });

    it("throws only for the kinds still missing after partial registration", () => {
      registerSink({ kind: "log", name: "a" });
      registerSink({ kind: "http_response", name: "b" });
      try {
        assertAllKindsRegistered();
        throw new Error("expected assertAllKindsRegistered to throw");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain("error_message");
        expect(message).toContain("url_query");
        expect(message).toContain("artifact_file");
        expect(message).not.toContain("log,");
      }
    });

    it("passes once every kind has at least one registered sink", () => {
      for (const kind of ALL_SINK_KINDS) {
        registerSink({ kind, name: `synthetic-${kind}` });
      }
      expect(() => assertAllKindsRegistered()).not.toThrow();
    });
  });
});
