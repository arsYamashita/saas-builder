# Template Routing Plan: reservation_saas

## Purpose

Document the minimum code changes needed to route generation to
reservation_saas-specific prompts when `template_key = "reservation_saas"`.

---

## Current State

### Prompt Loading

`lib/ai/build-prompt-with-rules.ts` loads prompts by filename:
```
buildPromptWithRules(prefixFilename, mainPromptFilename, replacements)
```

The caller (each generate-* route) hardcodes the prompt filenames:
- `prompts/final/01-blueprint-final.md`
- etc.

There is no template_key routing. All requests use MCA prompts.

### Rules References

Final prompts reference rules by path:
- `docs/rules/01-template-scope.md`
- `docs/rules/02-file-path-rules.md`
- `docs/rules/05-role-rules.md`

These are MCA-specific. reservation_saas versions are at:
- `docs/rules/reservation_saas/01-template-scope.md`
- `docs/rules/reservation_saas/02-file-path-rules.md`
- `docs/rules/reservation_saas/05-role-rules.md`

### What Already Works

- `projectFormSchema` already accepts `templateKey: "reservation_saas"`
- Project creation stores `template_key` in DB
- `createGenerationRun` receives `template_key`
- reservation_saas prompts and rules are now created

---

## Minimum Code Changes Required

### Change 1: Prompt Path Resolution

Add a function to resolve prompt paths by template_key.

```typescript
// lib/ai/template-prompt-resolver.ts (new file)
export function resolvePromptPath(
  templateKey: string,
  promptFilename: string
): string {
  // MCA uses root prompts/final/ (existing behavior)
  if (templateKey === "membership_content_affiliate") {
    return `prompts/final/${promptFilename}`;
  }
  // Other templates use prompts/final/{templateKey}/
  return `prompts/final/${templateKey}/${promptFilename}`;
}
```

### Change 2: Generate Routes

Each generate-* route must read `template_key` from the project
and use it to resolve the correct prompt path.

Affected routes:
- `app/api/projects/[projectId]/generate-blueprint/route.ts`
- `app/api/projects/[projectId]/generate-implementation/route.ts`
- `app/api/projects/[projectId]/generate-schema/route.ts`
- `app/api/projects/[projectId]/generate-api-design/route.ts`
- `app/api/projects/[projectId]/split-run-to-files/route.ts`

Pattern:
```typescript
const project = await getProject(projectId);
const promptPath = resolvePromptPath(project.template_key, "01-blueprint-final.md");
```

### Change 3: Rules References Inside Prompts

reservation_saas prompts already reference `docs/rules/reservation_saas/*.md`.
No additional code change needed — the rules paths are embedded in the prompt text.

---

## What Does NOT Change

- `generate-template/route.ts` — orchestration is template-agnostic
- `lib/quality/*` — scaffold and quality gate are template-agnostic
- `lib/db/*` — storage is template-agnostic
- `lib/auth/*`, `lib/tenant/*`, `lib/rbac/*`, `lib/audit/*` — shared core
- MCA prompts at `prompts/final/*.md` — untouched

---

## Safety Procedure

1. Run `npm run regression:mca` BEFORE making code changes
2. Make Change 1 (add resolver)
3. Make Change 2 (update routes to use resolver)
4. Run `npm run regression:mca` AFTER changes — must still be GREEN
5. If MCA breaks, revert and investigate
6. Only then attempt first reservation_saas generation

---

## Rollback

If reservation_saas breaks MCA:
1. Revert the route changes
2. Keep reservation_saas prompts/rules/fixture (they don't affect MCA)
3. Investigate the resolver logic
