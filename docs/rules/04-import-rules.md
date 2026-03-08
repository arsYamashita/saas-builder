# Import Rules

## Import Alias
Always use:
@/...

Examples:
- @/lib/db/supabase/admin
- @/lib/rbac/guards
- @/lib/auth/current-user
- @/components/domain/content-form

Do not use relative imports like:
- ../../../lib/...
unless absolutely unavoidable.

## Preferred Import Order
1. external packages
2. @/lib/*
3. @/components/*
4. @/types/*

## Forbidden Imports
Do not import from:
- internal private scripts
- export directories
- generated_files database layer in runtime pages
- node-only modules inside client components

## Client Component Rule
If a file uses:
- useState
- useEffect
- useRouter
- useParams
then it must start with:
"use client";

## Server Component Rule
Do not add "use client" unless necessary.
