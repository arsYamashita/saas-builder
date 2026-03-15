# Role Rules — internal_admin_ops_saas

## CRITICAL: Role Name Constraint

This template uses EXACTLY three roles. No more, no less.

### Allowed Roles (exhaustive list)
- owner
- admin
- operator

### Forbidden Roles (MUST NOT appear anywhere in output)
- member
- editor
- moderator
- superadmin
- viewer
- affiliate_manager
- staff

If ANY forbidden role name appears in ANY generated output — including
schema SQL, TypeScript types, API design documents, role-permission matrices,
test files, UI code, examples, or comments — the output is INVALID.

The word "member" must NEVER be used as a role name in this template.
Do NOT borrow role names from other templates (e.g. community_membership_saas uses "member" — that does NOT apply here).

### Where "operator" must appear
- SQL CHECK constraints on role columns: CHECK (role IN ('owner', 'admin', 'operator'))
- TypeScript type unions: 'owner' | 'admin' | 'operator'
- API design role requirements: "Operator", "Admin", "Owner"
- Permission matrices: rows for owner, admin, operator
- Test scenarios: operator user fixtures
- UI role guards and labels

## Access Rules
### owner
- full access
- tenant management
- user management
- category management
- request management
- approval management
- settings management

### admin
- category management
- request management (all)
- approval management (approve/reject)
- read settings
- no tenant ownership transfer

### operator
- create own requests
- read own requests
- read all approved requests
- update own pending requests
- no category management
- no approval actions
- no admin settings

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger.

Operator routes must check operator-level access explicitly.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
