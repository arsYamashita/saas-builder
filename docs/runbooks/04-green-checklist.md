# membership_content_affiliate Green Checklist

## Project Input

- [ ] templateKey is membership_content_affiliate
- [ ] requiredFeatures fit template
- [ ] managedData fit template
- [ ] roles only owner/admin/member
- [ ] billingModel is subscription
- [ ] affiliateEnabled is true

## Blueprint

- [ ] no extra entities
- [ ] no extra roles
- [ ] no extra screens
- [ ] content fields are correct
- [ ] membership plan fields are correct
- [ ] mvp scope is conservative

## Schema

- [ ] contents table valid
- [ ] membership_plans table valid
- [ ] no unrelated new tables
- [ ] tenant_id present
- [ ] timestamps present

## API Design

- [ ] allowed routes only
- [ ] zod validation included
- [ ] tenant boundary included
- [ ] role boundary included
- [ ] audit log on mutations included

## File Split

- [ ] only allowed file paths
- [ ] no forbidden path
- [ ] no duplicate conflicting files
- [ ] code only in content_text

## Export

- [ ] scaffold files exist
- [ ] generated files exported
- [ ] app structure exists
- [ ] tests/playwright exists

## Quality Gate

- [ ] npm install runs
- [ ] lint passes or has localized errors
- [ ] typecheck passes or only has clear missing-file issues
- [ ] playwright can at least hit root page

## Runtime

- [ ] /auth/signup opens
- [ ] /auth/login opens
- [ ] /dashboard opens after login
- [ ] /content renders
- [ ] /plans renders
- [ ] /billing renders
- [ ] /affiliate renders

## Billing Flow

- [ ] checkout session can be created
- [ ] portal session can be created
- [ ] webhook route exists
- [ ] subscription row can be written

## Affiliate Flow

- [ ] /a/[code] sets cookies
- [ ] referral can be created
- [ ] commission can be created on first subscription activation
