Generate Playwright end-to-end tests for a multi-tenant SaaS.

SCENARIOS:
1. owner signup
2. tenant creation
3. login
4. invite admin or staff
5. create domain entity
6. edit domain entity
7. delete domain entity
8. subscribe plan
9. access billing portal
10. create affiliate code
11. referral signup
12. commission created
13. role permission boundaries

TEST STRUCTURE:
- auth.spec.ts
- crud.spec.ts
- billing.spec.ts
- affiliate.spec.ts
- permissions.spec.ts

REQUIREMENTS:
- stable selectors
- clear setup
- clear teardown
- isolated tests
