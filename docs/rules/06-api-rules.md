# API Rules

## General
- use Route Handlers
- return JSON only
- validate input with zod
- enforce tenant boundary
- enforce role boundary
- return appropriate HTTP status codes

## Allowed Domain APIs
### Content
- GET /api/domain/content
- POST /api/domain/content
- GET /api/domain/content/[contentId]
- PATCH /api/domain/content/[contentId]

### Membership Plans
- GET /api/domain/membership-plans
- POST /api/domain/membership-plans
- GET /api/domain/membership-plans/[planId]
- PATCH /api/domain/membership-plans/[planId]

### Billing
- POST /api/billing/checkout
- POST /api/billing/portal
- GET /api/billing/subscriptions

### Stripe
- POST /api/stripe/webhook

## Response Shape
### Success List
{
  "contents": [...]
}
or
{
  "plans": [...]
}

### Success Single
{
  "content": {...}
}
or
{
  "plan": {...}
}

### Error
{
  "error": "Human readable error",
  "details": "More details if available"
}

## Mutation Rule
Every POST/PATCH for domain objects must write audit log.

## Tenant Rule
Every query must include tenant_id where applicable.

## Forbidden API Patterns
- do not use GraphQL
- do not introduce server actions for domain CRUD in this template
- do not use RPC as default
- do not create bulk endpoints unless explicitly requested
