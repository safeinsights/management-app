# SafeInsights Management App Conventions

Formatting (indentation, semicolons, line length) is enforced by `.editorconfig` and Prettier — run `pnpm run lint:fix`, do not hand-format.

## Code Style

- Use `@/` import alias for all `src/` imports
- Import React Query from `@/common` only
- Never use hardcoded route strings; use `Routes.*` from `src/lib/routes`
- No single-use constants in components: do not move a value that you use one time into a named `const` only to keep the JSX clean. This includes copy strings and static config props like `events={{ hover: true }}`. Write the value inline. If the value is complex, move it into a named helper or hook. Extract the value if more than one place uses it, or if it must have a stable reference (e.g. a `?? []` fallback that you pass as a prop). Outside JSX, named module-level constants for tunable values (`MAX_UPLOAD_BYTES`) and intermediate values whose names show their intent are fine.

## Refreshing data after a write

- Build every query key with `queryKeys` from `@/lib/query-keys`. Study data lives under `queryKeys.study(studyId)` and job data under `queryKeys.job(jobId)`, so one prefix invalidation refreshes all of it. ESLint refuses an array literal as a key.
- Every write a component starts goes through `useMutation({ mutationFn, invalidates })`, which names the keys the action changes. The wrapper invalidates them on success or error. It waits for active queries to refetch before your own `onSuccess` runs, but not before `onError`, so error feedback is never held up; `awaitInvalidation: false` skips the success wait where it would hold a dialog open. Components do not call `invalidateQueries`; ESLint refuses it everywhere except the wrapper, the study events listener and `useReloadOrgList` (Clerk org reload after sign-in, not an action result).
- An action that changes data a server component renders calls `revalidatePath(Routes...)` for another route or `refresh()` from `next/cache` for the current route. Client code calls `router.refresh()` only where no action ran (the study events listener, the kick-out check, sign-out).
- Status changes reach other open pages through server events: a write publishes one small event with `notifyStudyChanged` (`src/server/study-events.ts`) on its transaction, and `transitionJob` does so for every job status row. Browsers never send these messages themselves.
- Polling stays as it is for now: the global 15-minute `refetchInterval` and `staleTime` defaults in `providers.tsx`, and the polls for long work the enclave reports.

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
