import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  applyZodIssuesToForm,
  partitionIssuesByFields,
  resolveSubmitLabel,
  summarizeIssues,
  zodIssuesToFieldErrors,
} from "../errors";

const schema = z.object({
  name: z.string().min(2, "サービス名は2文字以上で入力してください"),
  summary: z.string().min(10, "サービス概要を入力してください"),
  roles: z.array(z.string()).min(1, "ロールを1つ以上選択してください"),
});

function issuesFor(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected validation failure in test fixture");
  return result.error.issues;
}

describe("zodIssuesToFieldErrors", () => {
  it("flattens issues into a path -> message map", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const map = zodIssuesToFieldErrors(issues);

    expect(map).toEqual({
      name: "サービス名は2文字以上で入力してください",
      summary: "サービス概要を入力してください",
      roles: "ロールを1つ以上選択してください",
    });
  });

  it("keeps only the first message per path", () => {
    const issues = [
      { path: ["name"], message: "first" },
      { path: ["name"], message: "second" },
    ] as z.ZodIssue[];

    expect(zodIssuesToFieldErrors(issues)).toEqual({ name: "first" });
  });

  it("returns an empty map for no issues", () => {
    expect(zodIssuesToFieldErrors([])).toEqual({});
  });
});

describe("partitionIssuesByFields", () => {
  it("splits issues into managed (form-registered) and unmanaged (root-only) buckets", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const { managed, unmanaged } = partitionIssuesByFields(issues, ["name", "summary"]);

    expect(managed.map((i) => i.path.join("."))).toEqual(["name", "summary"]);
    expect(unmanaged.map((i) => i.path.join("."))).toEqual(["roles"]);
  });

  it("puts everything in unmanaged when no field names are given", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const { managed, unmanaged } = partitionIssuesByFields(issues, []);

    expect(managed).toHaveLength(0);
    expect(unmanaged).toHaveLength(issues.length);
  });
});

describe("applyZodIssuesToForm", () => {
  it("calls setError once per issue with the schema's message and a 'server' type by default", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const setError = vi.fn();

    applyZodIssuesToForm(setError, issues);

    expect(setError).toHaveBeenCalledTimes(3);
    expect(setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "サービス名は2文字以上で入力してください",
    });
    expect(setError).toHaveBeenCalledWith("roles", {
      type: "server",
      message: "ロールを1つ以上選択してください",
    });
  });

  it("supports a custom error type", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const setError = vi.fn();

    applyZodIssuesToForm(setError, issues, "manual");

    expect(setError).toHaveBeenCalledWith(
      "name",
      expect.objectContaining({ type: "manual" })
    );
  });

  it("skips issues with an empty path", () => {
    const setError = vi.fn();
    applyZodIssuesToForm(setError, [
      { code: "custom", path: [], message: "form-level issue" } as z.ZodIssue,
    ]);

    expect(setError).not.toHaveBeenCalled();
  });
});

describe("summarizeIssues", () => {
  it("joins multiple messages with a separator", () => {
    const issues = issuesFor({ name: "A", summary: "short", roles: [] });
    const { unmanaged } = partitionIssuesByFields(issues, ["name", "summary"]);

    expect(summarizeIssues(unmanaged)).toBe("ロールを1つ以上選択してください");
  });

  it("returns undefined for an empty list so callers can `if (message)` directly", () => {
    expect(summarizeIssues([])).toBeUndefined();
  });
});

describe("resolveSubmitLabel", () => {
  const labels = { idle: "プロジェクトを作成", pending: "作成中..." };

  it("returns the idle label while not submitting", () => {
    expect(resolveSubmitLabel(false, labels)).toBe("プロジェクトを作成");
  });

  it("returns the pending label while submitting", () => {
    expect(resolveSubmitLabel(true, labels)).toBe("作成中...");
  });
});
