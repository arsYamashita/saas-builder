# Role Rules — simple_crm_saas

## Fixed Roles
Allowed roles:
- owner
- admin
- staff

## Template Role Usage
For simple_crm_saas template, only use:
- owner
- admin
- staff

Do not introduce:
- member
- editor
- moderator
- superadmin
- viewer
- affiliate_manager

## Access Rules
### owner
- full access
- tenant management
- staff management
- customer management
- deal management
- task management
- settings management

### admin
- customer management
- deal management
- task management
- read settings
- no tenant ownership transfer

### staff
- read customers
- read deals
- create/update own tasks
- update deal status
- no customer delete
- no admin settings

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger.

Staff routes must check staff-level access explicitly.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
