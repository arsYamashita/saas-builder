Read and obey these contracts in order:
1. docs/rules/community_membership_saas/01-template-scope.md
2. docs/rules/community_membership_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/community_membership_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md
10. docs/rules/10-claude-template-contract.md

You are not allowed to violate these rules.
If a requested output conflicts with the rules, follow the rules.
Generate only what is requested.

## Template-Specific Context: community_membership_saas

This template generates a community-driven membership SaaS.
Core domain: community content, member plans, and subscription-based access.

### Roles
ONLY these roles are allowed: owner, admin, editor, member.
Do NOT use: operator, moderator, staff, affiliate_manager.
The word "operator" must NEVER appear as a role in any output.

### Domain Entities
- plans (name, price, interval, features, active)
- contents (title, body, content_type, visibility, published)
- tags (name, slug)
- content_tags (content_id, tag_id)
- subscriptions (user, plan, status, stripe_subscription_id)
- purchases (user, content, stripe_payment_intent_id)

### Key Patterns
- Content visibility: public / members / plan-specific
- Subscription lifecycle: active → past_due → cancelled
- Editor can create/edit content, member can only read
- Tag-based content discovery
