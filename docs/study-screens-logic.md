# Study Screen Logic

How the app decides **which screen a researcher sees, which link/pill/highlight the dashboard
shows, and which status label is displayed** for a given study.

All of this logic lives in one pure module — `src/lib/study-screen/` — with **no React, DB, or
Next imports**. It takes raw study rows in and returns plain decisions out, so the whole machine
is unit-testable with object literals. The app layer (pages, dashboard) only fetches data, calls
the resolvers, and renders the result.

> Background and rationale: `docs/plans/2026-06-22-study-screen-state-machine-design.md`.

---

## Why a state machine

Before this, four places each re-derived overlapping state from incomplete inputs:

- `use-study-href.ts` — dashboard guessed _which URL_ to open.
- `view/page.tsx` — a nested if-cascade keyed on `?from=` query params + status ordering.
- `review/page.tsx` — a parallel reviewer cascade with its own `?from=` cases.
- `use-study-status.ts` + `study-row.tsx` — pill + row highlight, with their own recency logic.

They drifted, and most past bugs traced to code reading **"the newest status"** when status rows
can arrive **out of order**. The fix: derive everything **once**, from the whole status set.

### The core invariant: statuses are a set, not a sequence

`jobStatusChange.createdAt` defaults to `now()` (constant within a transaction, so sibling rows
tie), v7 UUIDs aren't reliably monotonic inside a millisecond, and webhook statuses
(`CODE-SCANNED`, results, execution) can arrive late. **So `statusChanges[0]` is never safe.**

Therefore the projection only asks **existence** (`some(status === X)`) and **count**
(how many `X`) questions about a job's statuses — never "what is the newest one."

Two axes, resolved differently:

| Axis                                     | Ordering matters? | Resolved by                                       |
| ---------------------------------------- | ----------------- | ------------------------------------------------- |
| **Across jobs** (which round is current) | Yes               | `max(studyJob.id)` — v7 ids match insertion order |
| **Within the latest job** (which phase)  | No                | set-existence / counting                          |

A resubmission opens a **brand-new `studyJob`** (a closed round is never reopened). So a
multi-round study has multiple jobs, and **only the latest job feeds the phase facts** — earlier
rounds are history. The lone cross-job fact is `submissionRound` (a count of rounds).

---

## The pipeline

```
                            DB
                            │
        rawStudyStateForStudy(studyId)        ← single query, study row + jobs + statusChanges
                            │
                       RawStudyState           ← raw rows; order NOT significant
                            │
                   projectStudyState()         ← disambiguate ONCE (set/count, never recency)
                            │
                        StudyState             ← flat booleans/enums; "latest job" facts
                            │
        ┌───────────────────┼────────────────────┬──────────────────────┐
        ▼                   ▼                    ▼                      ▼
  resolveScreen()   resolveDashboardAction()  resolvePillStatus()  resolveRowHighlight()
   (SCREEN_RULES)     (DASHBOARD_RULES)       (priority walk)       (role rule)
        │                   │                    │                      │
        ▼                   ▼                    ▼                      ▼
  ScreenDescriptor    DashboardAction         StatusLabel             boolean
        │
  SCREEN_COMPONENTS[descriptor.screen]   ← registry maps id → React component
        │
   rendered screen
```

Every consumer reads from the **same** `StudyState` — that is what keeps routing, the link, the
pill, and the highlight from drifting apart.

---

## Stage 1 — Projection (`state.ts`)

`projectStudyState(raw): StudyState` collapses raw rows into flat, already-disambiguated facts.

**Picking the latest job** (`latestJob`): take `max(id)` among jobs that have been _submitted_
(any non-`INITIATED` status); fall back to all jobs only if none are submitted. This stops a
baseline-only `INITIATED` job (an IDE launch / file upload that lands after a reviewed
submission) from masking the real code decision.

**Live code decision** — count-based, order-independent:

```
submittedCount = # CODE-SUBMITTED on latest job
decisionCount  = # decision statuses on latest job   (CODE-APPROVED/REJECTED/CHANGES-REQUESTED)
hasLiveDecision = decisionCount > 0 && decisionCount >= submittedCount
codeDecision   = hasLiveDecision ? highest-priority decision present : null
```

Decision priority: **`CODE-APPROVED` > `CODE-REJECTED` > `CODE-CHANGES-REQUESTED`** (approval is
permanent and wins if several ever coexist).

Why counting rather than "is a decision present?": the normal path opens a new job per round, so
the latest job has exactly one round. But a same-job resubmission shape can exist —
`CODE-SUBMITTED → decision → CODE-SUBMITTED`. There the newer `CODE-SUBMITTED` tips
`submittedCount` past `decisionCount`, so the prior decision is **no longer live** and the study
correctly reads "under review again." Counting handles both shapes and is permutation-invariant
(verified by `state.shuffle.test.ts`).

**Other key facts:**

- `hasSubmittedCode` = latest job has `CODE-SUBMITTED`.
- `codeAwaitingDecision` = `hasSubmittedCode && codeDecision === null`.
- `isExecuting` = latest job has a running status (`JOB-PROVISIONING/PACKAGING/READY/RUNNING`).
- `hasResults` / `resultsApproved` / `resultsRejected` / `resultsErrored` — results statuses are
  terminal-and-permanent for their job (pure existence; no counting).
- `displayStatus` — highest-priority **present** status (see `DISPLAY_STATUS_PRIORITY`), with
  stale code decisions dropped on a fresh resubmission; falls back to the study status.
- `submissionRound` — count of jobs that ever carried a `CODE-SUBMITTED` (the one cross-job fact).

---

## Stage 2 — Screen resolution (`screen-rules.ts` + `resolve.ts`)

`resolveScreen(role, state, step, ctx)` walks an **ordered, first-match-wins** rule table.
Order is display precedence; the last rule is `when: () => true`, so the function is **total**.

| #   | When                                                                   | Screen              |
| --- | ---------------------------------------------------------------------- | ------------------- |
| 1   | `hasResults`                                                           | `study-results`     |
| 2   | `codeDecision === 'CODE-APPROVED'` or `isExecuting`                    | `code-approved`     |
| 3   | `codeDecision === 'CODE-CHANGES-REQUESTED'`                            | `code-feedback`     |
| 4   | `codeDecision === 'CODE-REJECTED'`                                     | `code-feedback`     |
| 5   | `codeAwaitingDecision`                                                 | `code-under-review` |
| 6   | `status === 'APPROVED' && !hasSubmittedCode`                           | `proposal-feedback` |
| 7   | `status === 'PENDING-REVIEW'`                                          | `study-overview`    |
| 8   | `status === 'CHANGE-REQUESTED'`                                        | `proposal-feedback` |
| 9   | `status === 'REJECTED'` or `status === 'APPROVED'` (decided, has code) | `proposal-feedback` |
| 10  | `isDraft`                                                              | `study-overview`    |
| 11  | fallback                                                               | `study-overview`    |

Each rule decides only **which** screen renders; the leaf view owns its own back/forward
buttons. The `?from=` query param is gone — revisitable pages no longer redirect, because the
state machine derives the screen directly. A URL `step` is passed through as breadcrumb metadata.

### Screen registry (`_screens/registry.ts`)

`SCREEN_COMPONENTS` maps every `ScreenId` to a React component, typed as a total
`Record<ScreenId, ScreenComponent>` so a missing screen is a **compile error**, not a runtime
throw. `view/page.tsx` resolves the descriptor and awaits the mapped component (screens may be
async server components that load their own data):

```ts
const descriptor = resolveScreen('researcher', projectStudyState(rawStudyState), undefined, ctx)
const Screen = SCREEN_COMPONENTS[descriptor.screen]
return await Screen({ descriptor, study, raw: rawStudyState, ... })
```

Note two `ScreenId`s (`code-approved`, `code-feedback`) share one `CodeDecisionScreen` component
— it branches internally on the decision.

---

## Stage 3 — Dashboard action (`dashboard-rules.ts`)

`resolveDashboardAction(role, state, ctx)` is the same first-match pattern, returning the
`{ label, href, secondaryAction? }` for the dashboard cell. It is faithful to the old
`useStudyHref`: the label stays `"View"` for every non-draft destination.

| #   | When                                                                                       | Link             | Label                     |
| --- | ------------------------------------------------------------------------------------------ | ---------------- | ------------------------- |
| 1   | `isDraft`                                                                                  | `studyEdit`      | `Edit` (+ `delete-draft`) |
| 2   | `APPROVED && hasAnyJob && !hasSubmittedCode`                                               | `studyCode`      | `View`                    |
| 3   | `hasAnyJob`                                                                                | `studyView`      | `View`                    |
| 4   | `APPROVED && researcherAgreementsAcked`                                                    | `studyCode`      | `View`                    |
| 5   | post-submission status, no job (`PENDING-REVIEW`/`APPROVED`/`REJECTED`/`CHANGE-REQUESTED`) | `studySubmitted` | `View`                    |
| 6   | fallback                                                                                   | `studyView`      | `View`                    |

---

## Stage 4 — Pill + row highlight (`pill.ts`)

`resolvePillStatus(role, state)` walks `DISPLAY_STATUS_PRIORITY` over the **latest job's status
set**, returning the label for the first status **the role can label**. This is why a researcher
(who has no execution sub-status labels) falls through `JOB-PACKAGING/READY/RUNNING` to
`CODE-APPROVED`, while a reviewer shows the granular execution label. Role-specific rules:

- a **researcher hides `JOB-ERRORED`** until a reviewer records a `FILES-*` decision;
- on a resubmission (`codeAwaitingDecision`), **stale code-decision statuses are dropped** so the
  fresh `CODE-SUBMITTED` drives the pill, not the prior round's decision.

Fallbacks: status candidate label → study-status label → a guaranteed-present terminal
`FALLBACK_LABEL` (no non-null assertion that could lie).

`resolveRowHighlight(role, state)`: researcher highlights on `resultsApproved`; reviewer
highlights on `PENDING-REVIEW` or `codeAwaitingDecision`.

> **Deliberate divergence from legacy:** when one job carries both `CODE-CHANGES-REQUESTED` and a
> terminal `CODE-REJECTED`, the pill now reads **Rejected** (the truthful terminal state), and it
> agrees with the rejected-screen routing. Legacy's reversed-label-order ranked them the other way.

---

## Job round semantics

- A round **closes** only on `FILES-APPROVED` / `FILES-REJECTED`.
- A `CODE-CHANGES-REQUESTED` resubmit **reuses the same job** (the round is still open).
- `CODE-SUBMITTED` is **append-only per round**.
- User-facing submission **version** = `CODE-CHANGES-REQUESTED` count + 1 (`codeSubmissionVersion`),
  which is distinct from `submissionRound` (count of jobs that ever carried a submission).

---

## Role dimension

The resolvers take a `role` (`'researcher' | 'reviewer'`), but only the **researcher** rules are
implemented today. Reviewer rules are stubbed: `resolveScreen` falls through to the researcher
table's fallback so callers never crash, and the reviewer `/review` page is **not** migrated yet —
it keeps working unchanged. Adding the reviewer flow later means adding a reviewer rule table, not
re-architecting.

---

## File map

| File                             | Responsibility                                               |
| -------------------------------- | ------------------------------------------------------------ |
| `state.types.ts`                 | `RawStudyState`, `StudyState`, `DashboardState`, `StudyRole` |
| `state.ts`                       | `projectStudyState` + priority constants                     |
| `screens.ts`                     | `ScreenId`, `ScreenDescriptor`, `DashboardAction` types      |
| `screen-rules.ts`                | `SCREEN_RULES` table                                         |
| `dashboard-rules.ts`             | `DASHBOARD_RULES` table                                      |
| `resolve.ts`                     | `resolveScreen`, `resolveDashboardAction`                    |
| `pill.ts`                        | `resolvePillStatus`, `resolveRowHighlight`                   |
| `index.ts`                       | public barrel                                                |
| `server/db/study-state-query.ts` | `rawStudyStateForStudy` — the single fetch                   |
| `_screens/registry.ts`           | `SCREEN_COMPONENTS` id → component map                       |

Tests sit next to each module; `state.shuffle.test.ts` and `consistency.test.ts` enforce the
order-independence and cross-resolver-agreement invariants.
