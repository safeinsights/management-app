## Hard Rules

- Keep JSX minimal: no logic inside the return statement — no complex ternaries, no calculations, no object or array literals built inline. A bare `.map()` that delegates each item to an extracted row component is fine; a `.map()` whose callback contains logic is not.
- Move logic out: All state management, event handling, and data processing must be in custom hooks (useFeatureName) or helper functions outside the main component function.
- Co-locate, don't embed: If logic is used only in the component, define it just above the JSX, keep the JSX clean of declarations and other logic
- Extract: If a sub-section of a function or JSX is complex, break it into separate, smaller parts.
- Conditional visibility: Instead of hiding/showing large blocks using `{condition && <Component />}`, have the component accept an `isVisible` prop and return null when it shouldn't render.
- Comments: Reserve comments for genuinely hard-to-understand code. Be brief and to the point — explain **why**, not **how**; the code already shows how. Prefer one or two lines, three at the outside. A comment longer than the code it describes is a smell: if the reasoning truly needs more room, link a ticket instead of restating it. Do not write comments that narrate the code (`// Create profile` before `insertInto('profile')`), banner separators (`// ==== Handlers ====`), or JSDoc that merely repeats the signature (`@param schema - the schema`). If the code is self-explanatory, no comment is needed.
- Testing: Write unit tests for new features. Only mock using helpers from `@/tests/unit.helpers` as needed, do not mock out any of our own components or actions.
- E2E timeouts: Do not set inline timeouts in Playwright tests. Timeouts are configured globally in `playwright.config.ts` using constants from `tests/common.helpers.ts`.
- E2E flakiness: ZERO tolerance. Playwright runs with `retries: 0` and full parallelism (`fullyParallel: true`, no fixed worker cap) on every environment including CI. A test that only passes on retry is a bug — fix the root cause (await the right signal, use web-first `expect` assertions/`toPass`, isolate per-test data with `studyFeatures.uniqueTitle`), never add a retry, an inline timeout, or a bare `waitForTimeout` to mask it. Do not raise `retries` above 0 or pin `workers` to 1 to make a suite "pass". A change is not done until the full e2e suite passes repeatedly at `retries: 0` under parallelism.
- Migrations - UUID primary keys: Always default `uuid` id columns to `v7uuid()` (defined in `1727370622500_uuid_fn.ts`), never `gen_random_uuid()`. v7 UUIDs are time-ordered, which gives better index locality and natural insertion order.
- Migrations - timestamp columns: Always use `'timestamptz'` (timestamp with time zone), never `'timestamp'`. Pattern: `.addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql\`now()\`))`.
- Screen rules doc: When modifying `src/lib/study-screen/*-screen-rules.ts`, also update the matching tables in `docs/study-screens-logic.md`.

@CONVENTIONS.md

## Stop Conditions

- Stop if running unit tests or linting fails; fix before proceeding
- Ask before committing work
- Ask before creating new migrations
- Ask before modifying permission rules in `src/lib/permissions.ts`
- Ask before changing route definitions in `src/lib/routes/definitions.ts`
- Do not commit planning files unless explicitly instructed to do so
