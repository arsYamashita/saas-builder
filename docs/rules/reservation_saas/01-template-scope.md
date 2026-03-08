# reservation_saas Template Scope

## Purpose
This template is for:
- reservation / booking management
- service catalog
- customer management
- staff scheduling (MVP: simple)

## Included Domain Objects
- services
- reservations
- customers
- staff_members

## Included Screens
- /dashboard
- /services
- /services/new
- /services/[serviceId]/edit
- /reservations
- /reservations/new
- /reservations/[reservationId]/edit
- /customers
- /customers/[customerId]
- /settings

## Included Core Modules
- auth
- tenant
- role based access control
- audit logs

## Explicitly Out of Scope
- affiliate tracking
- content publishing
- subscription billing (MVP: none)
- mobile app
- advanced analytics
- multi-language
- workflow builder
- calendar sync
- payment processing (future)
- notification system (future)
