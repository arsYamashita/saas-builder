import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementAuditLogFailure,
  getAuditLogFailureMetrics,
  resetAuditLogFailureMetrics,
} from "../metrics";

describe("audit log failure metrics", () => {
  beforeEach(() => resetAuditLogFailureMetrics());

  it("starts at zero for all kinds", () => {
    expect(getAuditLogFailureMetrics()).toEqual({
      "fail-closed": 0,
      "fail-recorded": 0,
      "fail-recorded-double-failure": 0,
    });
  });

  it("increments independently per kind", () => {
    incrementAuditLogFailure("fail-recorded");
    incrementAuditLogFailure("fail-recorded");
    incrementAuditLogFailure("fail-closed");

    expect(getAuditLogFailureMetrics()).toEqual({
      "fail-closed": 1,
      "fail-recorded": 2,
      "fail-recorded-double-failure": 0,
    });
  });

  it("resets to zero", () => {
    incrementAuditLogFailure("fail-recorded-double-failure");
    resetAuditLogFailureMetrics();
    expect(getAuditLogFailureMetrics()["fail-recorded-double-failure"]).toBe(0);
  });
});
