# DB Rules

## Existing Tables Are Source of Truth
AI must use existing tables:
- contents
- membership_plans
- subscriptions
- affiliates
- referrals
- commissions
- tenant_users
- tenants
- users

## Forbidden Changes
Do not rename tables.
Do not rename columns.
Do not add unrelated tables.

## Tenant Boundary
All domain tables must be queried with tenant_id where applicable.

## Content Rules
Use:
- title
- body
- content_type
- visibility
- published
- published_at
- created_by

## Membership Plan Rules
Use:
- name
- description
- price_id
- status

## Subscription Rules
Do not create new billing tables unless explicitly requested.
Use existing subscriptions table.

## Audit Rule
Every mutation should create audit log entry.
