# Local First Run Checklist

This checklist ensures the Builder can run its first template generation.

Follow in order.

---

## 1. Install Dependencies

Run:

```
npm install
```

Confirm:

```
node_modules exists
```

---

## 2. Confirm .env.local Exists

Check project root.

```
ls -a
```

Expected:

```
.env.local
```

Open it and verify keys exist.

---

## 3. Verify Supabase Connection

Run dev server.

```
npm run dev
```

Open:

```
http://localhost:3000
```

If Supabase connection fails you will see errors in the server console.

---

## 4. Apply Database Migrations

Run:

```
npx supabase db push
```

Confirm tables exist.

Important tables:

```
projects
blueprints
implementation_runs
generated_files
generation_runs
quality_runs
contents
membership_plans
subscriptions
affiliates
referrals
commissions
```

If any missing, migration must be fixed first.

---

## 5. Confirm Prompt Files

Verify these exist:

```
prompts/final/01-blueprint-final.md
prompts/final/02-schema-final.md
prompts/final/03-api-final.md
prompts/final/04-ui-final.md
prompts/final/05-file-split-final.md
```

---

## 6. Confirm Rules Directory

Check:

```
docs/rules/
```

Expected files:

```
01-template-scope.md
02-file-path-rules.md
03-naming-rules.md
04-import-rules.md
05-role-rules.md
06-api-rules.md
07-ui-rules.md
08-db-rules.md
09-output-format-rules.md
10-claude-template-contract.md
11-lovable-template-contract.md
```

---

## 7. Confirm Builder UI

Open:

```
http://localhost:3000
```

Verify pages render:

- Projects
- Project Detail
- Generate Full Template button

---

## 8. Create Test Project

Use fixed input.

Run:

```
curl -X POST http://localhost:3000/api/projects
```

Expected response:

```json
{
  "project": {
    "id": "...",
    "name": "SalonCore First Run"
  }
}
```

Save project id.

---

## 9. Run Template Generation

Run:

```
POST /api/projects/{projectId}/generate-template
```

Confirm generation_runs record created.

---

## 10. Inspect Generation Steps

Check order:

```
blueprint
implementation
schema
api_design
split_files
export_files
```

Find first failure point.

---

## 11. Export Files

Run:

```
POST /api/projects/{projectId}/export-files
```

Confirm directory created:

```
exports/projects/{projectId}
```

---

## 12. Run Quality Gate

Run:

```
POST /api/projects/{projectId}/run-quality-gate
```

Inspect results.

Order:

```
install
lint
typecheck
playwright
```

---

## 13. Acceptable First Run Result

The first run is acceptable if:

- generation_runs exists
- blueprint saved
- implementation saved
- generated_files exist
- export directory exists
- quality run executed
- first failure point identified

Full green is not required.

---

## 14. Record Run Log

Record:

```
Project ID
Generation Run ID
Failed Step
Error Message
lint status
typecheck status
playwright status
```

---

## 15. Stop Rule

If generation fails upstream:

```
blueprint
implementation
schema
```

Do not debug downstream.

Fix upstream first.
