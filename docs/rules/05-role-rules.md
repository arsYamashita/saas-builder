# Role Rules

## Fixed Roles
Allowed roles:
- owner
- admin
- staff
- member
- affiliate_manager

## Template Role Usage
For membership_content_affiliate template, only use:
- owner
- admin
- member

Do not introduce:
- editor
- moderator
- superadmin
- viewer

## Access Rules
### owner
- full access
- billing management
- affiliate management
- content management
- plan management
- tenant management

### admin
- content management
- plan management
- read billing page
- read affiliate page
- no tenant ownership transfer

### member
- read allowed content
- read own billing state
- no admin CRUD

## Enforcement Rule
All server routes that mutate domain data must call:
requireTenantRole("admin")
or stronger.

All admin pages must enforce role at page level.

Do not rely on client-only hiding for authorization.
