# Role Rules — community_membership_saas

## CRITICAL: Role Name Constraint

This template uses EXACTLY four roles. No more, no less.

### Allowed Roles (exhaustive list)
- owner
- admin
- editor
- member

### Forbidden Roles (MUST NOT appear anywhere in output)
- operator
- moderator
- superadmin
- viewer
- affiliate_manager
- staff

If ANY forbidden role name appears in ANY generated output — including
schema SQL, TypeScript types, API design documents, role-permission matrices,
test files, UI code, examples, or comments — the output is INVALID.

The word "operator" must NEVER be used as a role name in this template.
Do NOT borrow role names from other templates (e.g. internal_admin_ops_saas uses "operator" — that does NOT apply here).

### Where roles must appear
- SQL CHECK constraints on role columns: CHECK (role IN ('owner', 'admin', 'editor', 'member'))
- TypeScript type unions: 'owner' | 'admin' | 'editor' | 'member'
- API design role requirements: "Member", "Editor", "Admin", "Owner"
- Permission matrices: rows for owner, admin, editor, member
- Test scenarios: member user fixtures
- UI role guards and labels

## Access Rules
### owner
- full access
- tenant management
- user/member management
- plan management
- content management
- tag management
- settings management
- billing management

### admin
- member management (invite, update role, remove)
- plan management
- content management
- tag management
- read settings
- no tenant ownership transfer

### editor
- content CRUD (own + tenant-scoped)
- read members
- read plans
- read tags
- no member management
- no plan management
- no settings

### member
- view public and accessible content
- purchase content / subscribe to plans
- view own purchases and subscriptions
- no content management
- no member management
- no admin settings

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger, except content routes which may allow "editor".

Member routes must check member-level access explicitly via access.ts.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
