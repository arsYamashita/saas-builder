# Role Rules — simple_crm_saas

## CRITICAL: Role Name Constraint

This template uses EXACTLY three roles. No more, no less.

### Allowed Roles (exhaustive list)
- owner
- admin
- sales

### Forbidden Roles (MUST NOT appear anywhere in output)
- member
- operator
- staff
- editor
- moderator
- superadmin
- viewer
- affiliate_manager

If ANY forbidden role name appears in ANY generated output — including
schema SQL, TypeScript types, API design documents, role-permission matrices,
test files, UI code, examples, or comments — the output is INVALID.

The word "member" must NEVER be used as a role name in this template.
The word "staff" must NEVER be used as a role name in this template.
Do NOT borrow role names from other templates (e.g. community_membership_saas uses "member", internal_admin_ops_saas uses "operator" — neither applies here).

### Where "sales" must appear
- SQL CHECK constraints on role columns: CHECK (role IN ('owner', 'admin', 'sales'))
- TypeScript type unions: 'owner' | 'admin' | 'sales'
- API design role requirements: "Sales", "Admin", "Owner"
- Permission matrices: rows for owner, admin, sales
- UI role guards and labels

## Access Rules
### owner
- full access
- tenant management
- sales staff management
- contact management
- company management
- deal management
- activity management
- settings management

### admin
- contact management
- company management
- deal management
- activity management
- read settings
- no tenant ownership transfer

### sales
- read contacts
- read companies
- read deals
- create/update own activities
- update deal status
- no contact delete
- no company delete
- no admin settings

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger.

Sales routes must check sales-level access explicitly.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
