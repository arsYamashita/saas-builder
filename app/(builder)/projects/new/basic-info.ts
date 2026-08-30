import { z } from "zod";
import { defaultProjectFormValues } from "./defaultValues";
import { projectFormSchema } from "@/lib/validation/project-form";
import { PRESET_MAP } from "@/lib/templates/preset-map";
import { MAX_LLM_BRIEF_FIELD_CHARS } from "@/lib/validation/llm-input-limits";
import type { TemplateKey } from "@/types/project";

/**
 * Split out of `page.tsx` (2026-08-30): a Next.js App Router `page.tsx` may
 * only export the handful of names the framework recognizes (default,
 * metadata, generateStaticParams, ...) — `next build`'s type-checking pass
 * rejects any other named export ("... is not a valid Page export field"),
 * even though `tsc --noEmit` and `vitest` do not catch this. The tests in
 * `__tests__/project-basic-info-schema.test.ts` need `projectBasicInfoSchema`
 * / `buildProjectPayload` directly, so both live here instead and `page.tsx`
 * imports them without re-exporting.
 *
 * The wizard only collects `name` / `summary` / `targetUsers` by hand — the
 * rest of `projectFormSchema` is derived from the selected template preset
 * (see `buildProjectPayload` below). `.pick` keeps this a *view* onto the
 * single canonical schema rather than a hand-maintained duplicate for
 * `name` / `summary`.
 *
 * `targetUsers` is deliberately re-declared (not picked as-is): the
 * canonical schema's `min(5)` is meant for the *post-fallback* value
 * `buildProjectPayload` computes (template default / "一般ユーザー"), not
 * the raw "任意" field on step 2, which must accept blank. But it must
 * still reject a short *non-blank* value here (not merely allow anything),
 * and it must keep the canonical schema's `max(MAX_LLM_BRIEF_FIELD_CHARS)`
 * (dropping it would both re-open the unbounded-text-into-LLM-prompt guard
 * the canonical schema exists for, and strand the user: the wizard's only
 * opportunity to show a field-level error is step 2; by step 3 (where
 * submit happens) this field isn't rendered, so if an invalid value slipped
 * through to the final `projectFormSchema.safeParse` in `onSubmit`, that
 * failure would have nowhere visible to surface (see 2026-07-11 codex
 * review, gpt-5.6-terra).
 */
export const projectBasicInfoSchema = projectFormSchema
  .pick({ name: true, summary: true, targetUsers: true })
  .extend({
    targetUsers: z
      .string()
      .max(
        MAX_LLM_BRIEF_FIELD_CHARS,
        `ターゲットユーザーが長すぎます（最大 ${MAX_LLM_BRIEF_FIELD_CHARS} 文字）`
      )
      .optional()
      .default("")
      .refine((value) => value.length === 0 || value.length >= 5, {
        message: "5文字以上で入力するか、空欄のままにしてください",
      }),
  });

export const BASIC_INFO_FIELDS = ["name", "summary", "targetUsers"] as const;

/* ---------- Template-aware defaults for problemToSolve ---------- */
const TEMPLATE_PROBLEM_DEFAULTS: Record<string, string> = {
  membership_content_affiliate:
    "会員管理やコンテンツ販売の仕組みを効率的に構築したい",
  reservation_saas: "予約の管理や顧客対応を効率化したい",
  community_membership_saas:
    "コミュニティの運営と会員管理を一元化したい",
  simple_crm_saas: "顧客情報や営業プロセスを効率的に管理したい",
  internal_admin_ops_saas:
    "社内の業務プロセスや承認フローを効率化したい",
};

/**
 * Merges the 3 hand-entered fields (already validated by
 * `projectBasicInfoSchema`) with the selected template's preset into a full
 * `projectFormSchema`-shaped payload. Pure, dependency-injected so the
 * "no re-trim" invariant that fixed the whitespace-padding bug above can be
 * unit tested directly — see `__tests__/project-basic-info-schema.test.ts`.
 */
export function buildProjectPayload(
  basicInfo: { name: string; summary: string; targetUsers: string },
  selectedTemplate: string | null,
  selectedCatalogTargetUsers: string | undefined
) {
  const base = { ...defaultProjectFormValues };
  const templateKey = (selectedTemplate || "custom") as TemplateKey;

  // Apply preset if available
  const preset = PRESET_MAP[templateKey];
  if (preset) {
    Object.assign(base, preset);
  }

  // Override with user-entered values. Deliberately *not* re-trimmed here:
  // `basicInfo` already passed `projectBasicInfoSchema` (raw, untrimmed
  // length checks — same as the canonical `projectFormSchema` this payload
  // is re-validated against on submit). Trimming at this stage would
  // validate one string and store a shorter one, which can flip a
  // borderline-valid value (e.g. a 2-char name with a leading space) into
  // one that fails the second-layer check silently, after the wizard has
  // already moved to the step where these fields aren't rendered (caught in
  // codex review, gpt-5.6-terra).
  base.templateKey = templateKey;
  base.name = basicInfo.name;
  base.summary = basicInfo.summary;
  base.targetUsers = basicInfo.targetUsers || selectedCatalogTargetUsers || "一般ユーザー";

  // Auto-fill problemToSolve from template if not customized
  if (!base.problemToSolve || base.problemToSolve === defaultProjectFormValues.problemToSolve) {
    base.problemToSolve =
      TEMPLATE_PROBLEM_DEFAULTS[templateKey] || `${base.name}を通じてユーザーの課題を解決したい`;
  }

  return base;
}
