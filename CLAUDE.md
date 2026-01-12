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

## Stop Conditions

- Stop if running unit tests or linting fails; fix before proceeding
- Ask before committing work
- Ask before creating new migrations
- Ask before modifying permission rules in `src/lib/permissions.ts`
- Ask before changing route definitions in `src/lib/routes/definitions.ts`
