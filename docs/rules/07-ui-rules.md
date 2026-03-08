# UI Rules

## General UI Style
- clean
- admin-first
- minimal
- readable
- no flashy gradients
- no excessive cards

## Screen Layout Rules
### List Pages
Must contain:
- page title
- primary create button
- table
- empty state

### New/Edit Pages
Must contain:
- page title
- single main form
- submit button
- no multi-step wizard

### Billing Page
Must contain:
- available plans
- current subscriptions
- portal button

### Affiliate Page
Must contain:
- affiliate link
- commissions list

## Form Rules
- use one form component per entity
- no inline giant forms inside list pages
- keep input names aligned with validation schema
- checkbox only for booleans
- select only for constrained enums

## Navigation Rules
Admin navigation must include:
- Dashboard
- Contents
- Plans
- Billing
- Affiliate
- Logout

## Forbidden UI Patterns
- drag and drop builder
- nested tabs inside tabs
- client-side only auth gating
- optimistic complex updates for billing
