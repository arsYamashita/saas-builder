Read and obey these contracts in order:
1. docs/rules/reservation_saas/01-template-scope.md
2. docs/rules/reservation_saas/02-file-path-rules.md
3. docs/rules/03-naming-rules.md
4. docs/rules/04-import-rules.md
5. docs/rules/reservation_saas/05-role-rules.md
6. docs/rules/06-api-rules.md
7. docs/rules/07-ui-rules.md
8. docs/rules/08-db-rules.md
9. docs/rules/09-output-format-rules.md
10. docs/rules/10-claude-template-contract.md

You are not allowed to violate these rules.
If a requested output conflicts with the rules, follow the rules.
Generate only what is requested.

## Template-Specific Context: reservation_saas

This template generates a reservation management SaaS.
Core domain: appointment/booking management with time slots, services, and staff.

### Roles
ONLY these roles are allowed: owner, admin, staff.
Do NOT use: member, editor, moderator, affiliate_manager.

### Domain Entities
- services (name, duration, price, active)
- reservations (service, staff, customer, datetime, status)
- customers (name, email, phone)
- staff_schedules (staff, day_of_week, start_time, end_time)

### Key Patterns
- Time slot availability checking
- Reservation state machine: pending → confirmed → completed / cancelled
- Staff assignment per service
- Customer self-booking (public) vs admin booking
