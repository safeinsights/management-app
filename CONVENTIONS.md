# SafeInsights Management App Conventions

Formatting (indentation, semicolons, line length) is enforced by `.editorconfig` and Prettier — run `pnpm run lint:fix`, do not hand-format.

## Code Style

- Use `@/` import alias for all `src/` imports
- Import React Query from `@/common` only
- Never use hardcoded route strings; use `Routes.*` from `src/lib/routes`
- No single-use constants in components: do not move a value that you use one time into a named `const` only to keep the JSX clean. This includes copy strings and static config props like `events={{ hover: true }}`. Write the value inline. If the value is complex, move it into a named helper or hook. Extract the value if more than one place uses it, or if it must have a stable reference (e.g. a `?? []` fallback that you pass as a prop). Outside JSX, named module-level constants for tunable values (`MAX_UPLOAD_BYTES`) and intermediate values whose names show their intent are fine.

## Unit Testing

- Tests use vitest; import it and helpers from `@/tests/unit.helpers`
- Place tests next to source files with a `.test.ts(x)` suffix
- Do not mock the database; assert records exist in the db
- Do not mock Clerk or Next.js methods — they are mocked already
- Test critical functionality (e.g. button clicks update state), not the appearance of every UI element
- Do not clean up mocks or other state

## Validation Commands

Before finishing a change, run:

- `pnpm run lint:fix` — fix lint/format issues
- `pnpm run test:unit` — run unit tests
- `pnpm run checks` — type checking + linting + action validation
