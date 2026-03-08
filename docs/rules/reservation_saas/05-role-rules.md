# Role Rules — reservation_saas

## Fixed Roles
Allowed roles:
- owner
- admin
- staff

## Template Role Usage
For reservation_saas template, only use:
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
- service management
- reservation management
- customer management
- settings management

### admin
- service management
- reservation management
- customer management
- read settings
- no tenant ownership transfer

### staff
- read own reservations
- update reservation status (confirm, complete, cancel)
- read services
- read customers
- no service CRUD
- no admin settings

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger.

Staff routes must check staff-level access explicitly.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
