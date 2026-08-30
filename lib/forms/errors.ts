import type { FieldValues, UseFormSetError, FieldPath } from "react-hook-form";
import type { z } from "zod";

/**
 * Client/server dual-validation helpers for `useZodForm`.
 *
 * The intended pattern is:
 *   1. `useZodForm(schema)` validates user input as they type/blur fields.
 *   2. Before (or after) hitting the API, re-run the *canonical* schema
 *      (often a superset — e.g. a value merged with server-only defaults)
 *      via `schema.safeParse(...)`.
 *   3. Feed the resulting `z.ZodIssue[]` back into the form with
 *      `applyZodIssuesToForm` so the user sees the exact same messages
 *      regardless of which layer caught the problem.
 *
 * All functions here are plain, framework-agnostic transforms — no React
 * rendering involved — so they can be unit tested without a DOM.
 */

/** Flat `"a.b.c"` path -> message map. */
export type FieldErrorMap = Record<string, string>;

/**
 * Flattens Zod issues into a `{ path: message }` map, keeping only the
 * first message per path (mirrors how a single form field shows one error
 * at a time).
 */
export function zodIssuesToFieldErrors(issues: readonly z.ZodIssue[]): FieldErrorMap {
  const map: FieldErrorMap = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key && !(key in map)) {
      map[key] = issue.message;
    }
  }
  return map;
}

/**
 * Splits Zod issues by whether their top-level path segment is one of the
 * form's own registered fields. Use this when re-validating a *superset*
 * schema (e.g. the full canonical schema) against a form that only manages
 * a subset of its fields: issues on managed fields can be attached with
 * `setError`, issues on unmanaged fields have nowhere field-level to go and
 * should be surfaced as a root/summary message instead.
 */
export function partitionIssuesByFields(
  issues: readonly z.ZodIssue[],
  managedFieldNames: readonly string[]
): { managed: z.ZodIssue[]; unmanaged: z.ZodIssue[] } {
  const managedSet = new Set(managedFieldNames);
  const managed: z.ZodIssue[] = [];
  const unmanaged: z.ZodIssue[] = [];
  for (const issue of issues) {
    const top = String(issue.path[0] ?? "");
    if (managedSet.has(top)) {
      managed.push(issue);
    } else {
      unmanaged.push(issue);
    }
  }
  return { managed, unmanaged };
}

/**
 * Applies Zod issues to a react-hook-form instance via `setError`, one call
 * per issue path. Paths are assumed to belong to the form's field set
 * (filter with `partitionIssuesByFields` first if validating a superset
 * schema) — the cast mirrors what `@hookform/resolvers/zod` does
 * internally, since issue paths are only known at runtime.
 */
export function applyZodIssuesToForm<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  issues: readonly z.ZodIssue[],
  errorType = "server"
): void {
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!path) continue;
    setError(path as FieldPath<TFieldValues>, { type: errorType, message: issue.message });
  }
}

/**
 * Joins unmanaged/root-level issue messages into one summary string for a
 * banner-style alert (see `components/ui/form-alert.tsx`). Returns
 * `undefined` for an empty list so callers can `if (message) ...` directly.
 */
export function summarizeIssues(issues: readonly z.ZodIssue[]): string | undefined {
  if (issues.length === 0) return undefined;
  return issues.map((issue) => issue.message).join(" / ");
}

/** Labels for the two states of a submit button driven by `formState.isSubmitting`. */
export interface SubmitStateLabels {
  idle: string;
  pending: string;
}

/** Picks the label to render on a submit button given RHF's `isSubmitting` flag. */
export function resolveSubmitLabel(isSubmitting: boolean, labels: SubmitStateLabels): string {
  return isSubmitting ? labels.pending : labels.idle;
}
