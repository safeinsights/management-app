## Hard Rules

- Keep JSX minimal: No complex ternary operators, map functions, or calculations inside the return statement.
- Move logic out: All state management, event handling, and data processing must be in custom hooks (useFeatureName) or helper functions outside the main component function.
- Co-locate, don't embed: If logic is used only in the component, define it just above the JSX, keep the JSX declaration clean.
- Extract components: If a sub-section of the JSX is complex, break it into a separate, smaller component files.
- Use `@/` import alias for all `src/` imports
- Import React Query from `@/common` only
- Never use hardcoded route strings; use `Routes.*` from `src/lib/routes`
- Unit tests go next to source files with `.test.ts(x)` suffix
- Don't mock database in unit tests; test actual records exist
- After any code change: run `npm run lint:fix && npm run test:unit`
- Do not intermingle logic with JSX, create small cohesive components instead.   

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
