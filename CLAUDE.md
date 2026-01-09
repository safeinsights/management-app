# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard Rules

- No semicolons (ESLint enforced)
- 4-space indentation, 120 char max line length
- Use `@/` import alias for all `src/` imports
- Import React Query from `@/common` only
- Never use hardcoded route strings; use `Routes.*` from `src/lib/routes`
- Unit tests go next to source files with `.test.ts(x)` suffix
- Don't mock database in unit tests; test actual records exist
- After any code change: run `npm run lint:fix && npm run test:unit`

## Authority & Links

- `CONVENTIONS.md` - code style rules
- `src/lib/routes/definitions.ts` - all route definitions (Zod schemas)
- `src/lib/permissions.ts` - CASL authorization rules
- `src/server/actions/` - server actions (middleware pattern)
- `src/server/db/queries.ts` - database reads
- `src/server/db/mutations.ts` - database writes
- `src/database/migrations/` - Kysely migrations

## Workflow

```bash
npm run lint:fix               # Fix lint issues
npm run test:unit              # Run unit tests (required after changes)
npm run pre:push               # Full check: lint + typecheck + validate-actions
npm run db:migrate             # Run database migrations
npx kysely migrate:make <name> # Create migration (use snake_case)
```

## Stop Conditions

- Stop if `npm run test:unit` fails; fix before proceeding
- Stop if `npm run lint:fix` reports unfixable errors
- Ask before creating new migrations
- Ask before modifying permission rules in `src/lib/permissions.ts`
- Ask before changing route definitions in `src/lib/routes/definitions.ts`
