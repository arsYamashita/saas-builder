import { describe, it, expect } from "vitest";
import {
  getRouteForTask,
  getExpectedFormat,
  listRoutes,
} from "../task-router";
import type { TaskKind } from "../provider-interface";

describe("getRouteForTask", () => {
  it("routes intake to gemini with claude fallback", () => {
    const route = getRouteForTask("intake");
    expect(route.primary).toBe("gemini");
    expect(route.fallback).toBe("claude");
  });

  it("routes blueprint to gemini with claude fallback", () => {
    const route = getRouteForTask("blueprint");
    expect(route.primary).toBe("gemini");
    expect(route.fallback).toBe("claude");
  });

  it("routes implementation to claude without fallback", () => {
    const route = getRouteForTask("implementation");
    expect(route.primary).toBe("claude");
    expect(route.fallback).toBeNull();
  });

  it("routes schema to claude", () => {
    const route = getRouteForTask("schema");
    expect(route.primary).toBe("claude");
  });

  it("routes file_split to claude with system prompt", () => {
    const route = getRouteForTask("file_split");
    expect(route.primary).toBe("claude");
    expect(route.system).toContain("file objects");
  });
});

describe("getExpectedFormat", () => {
  const cases: Array<[TaskKind, string]> = [
    ["intake", "text"],
    ["blueprint", "json"],
    ["brief_rewrite", "json"],
    ["implementation", "text"],
    ["schema", "text"],
    ["api_design", "text"],
    ["file_split", "files"],
    ["ui_generation", "files"],
    ["quality_fix", "files"],
    ["regression_repair", "files"],
  ];

  it.each(cases)("%s → %s", (taskKind: TaskKind, expected: string) => {
    expect(getExpectedFormat(taskKind)).toBe(expected);
  });
});

describe("listRoutes", () => {
  it("returns all task kinds", () => {
    const routes = listRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(9);
    const kinds = routes.map((r) => r.taskKind);
    expect(kinds).toContain("blueprint");
    expect(kinds).toContain("implementation");
    expect(kinds).toContain("file_split");
  });
});
