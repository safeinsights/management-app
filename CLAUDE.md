## Hard Rules

- Strive for simplicity and clarity
- Keep JSX minimal: No complex ternary operators, map functions, or calculations inside the return statement.
- Move logic out: All state management, event handling, and data processing must be in custom hooks (useFeatureName) or helper functions outside the main component function.
- Co-locate, don't embed: If logic is used only in the component, define it just above the JSX, keep the JSX clean of declarations and other logic
- Extract: If a sub-section of a function or JSX is complex, break it into separate, smaller parts.
- Conditional visibility: Instead of hiding/showing large blocks using `{condition && <Component />}`, have the component accept an `isVisible` prop and return null when it shouldn't render. This keeps JSX cleaner and makes intent clearer.

## Authority & Links

- `@CONVENTIONS.md` - code style rules
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
