# Study Screen Logic

How the app decides **which screen a researcher or reviewer sees, which link/pill/highlight the
dashboard shows, and which status label is displayed** for a given study.

All of this logic lives in one pure module — `src/lib/study-screen/` — with **no React, DB, or
Next imports**. It takes raw study rows in and returns plain decisions out, so the whole machine
is unit-testable with object literals. The app layer (pages, dashboard) only fetches data, calls
the resolvers, and renders the result.

> Background and rationale: `docs/plans/2026-06-22-study-screen-state-machine-design.md`
> (researcher) and `docs/plans/2026-06-23-reviewer-screen-state-machine-design.md` (reviewer).

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
  (role screen rules)  (DASHBOARD_RULES)       (priority walk)       (role rule)
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

## Stage 2 — Screen resolution (`researcher-screen-rules.ts` / `reviewer-screen-rules.ts` + `resolve.ts`)

`resolveScreen(role, state, step, ctx)` walks an **ordered, first-match-wins** rule table,
**selected by `role`** (`role === 'reviewer' ? REVIEWER_SCREEN_RULES : RESEARCHER_SCREEN_RULES`).
Order is display precedence; each table ends with `when: () => true`, so the function is **total**
for both roles. Both tables read the **same** `StudyState` — only the projection feeds them, never
raw jobs.

**Researcher table (`researcher-screen-rules.ts`):**

| #   | When                                                                             | Screen              |
| --- | -------------------------------------------------------------------------------- | ------------------- |
| 1   | `hasResults`                                                                     | `study-results`     |
| 2   | `codeDecision === 'CODE-APPROVED'` or `isExecuting`                              | `code-approved`     |
| 3   | `codeDecision === 'CODE-CHANGES-REQUESTED'` or `'CODE-REJECTED'`                 | `code-feedback`     |
| 4   | `codeAwaitingDecision`                                                           | `code-under-review` |
| 5   | `status === 'APPROVED' && !hasSubmittedCode`                                     | `proposal-feedback` |
| 6   | `status === 'PENDING-REVIEW'`                                                    | `study-overview`    |
| 7   | `status` ∈ `CHANGE-REQUESTED`/`REJECTED`/`APPROVED` (decided; APPROVED has code) | `proposal-feedback` |
| 8   | `isDraft`                                                                        | `study-overview`    |
| 9   | fallback                                                                         | `study-overview`    |

**Reviewer table (`reviewer-screen-rules.ts`)** — transcribes the legacy `review/page.tsx`
cascade with the `?from=` cases removed (those became routing, not screen-selection):

| #   | When                                                                     | Screen                       |
| --- | ------------------------------------------------------------------------ | ---------------------------- |
| 1   | `hasResults`                                                             | `reviewer-study-results`     |
| 2   | `codeDecision !== null`                                                  | `reviewer-code-feedback`     |
| 3   | `codeAwaitingDecision && !reviewerAgreementsAcked`                       | `reviewer-agreements`        |
| 4   | `codeAwaitingDecision`                                                   | `reviewer-code-review`       |
| 5   | `!hasSubmittedCode && status` ∈ `APPROVED`/`REJECTED`/`CHANGE-REQUESTED` | `reviewer-proposal-feedback` |
| 6   | `status === 'PENDING-REVIEW'`                                            | `reviewer-proposal-review`   |
| 7   | fallback                                                                 | `study-overview`             |

Precedence notes: results out-rank a present code decision (#1 > #2 — `CODE-APPROVED` is always
present once results land, mirroring legacy `decisionMade = hasLiveCodeDecision && !hasResultsStatus`);
the agreements gate sits **above** active review (#3 > #4 — a reviewer must ack before the review
page renders); and the proposal-feedback rule is gated on `!hasSubmittedCode` so the code rules own
the screen once code exists.

Each rule decides only **which** screen renders; the leaf view owns its own back/forward
buttons. The `?from=` query param is gone on **both** sides — revisitable pages no longer redirect,
because the state machine derives the screen directly.

**The `step` parameter (researcher read-only wizard).** For the researcher role, `step` caps the
rule table by rank so an advanced study can revisit an earlier read-only screen (e.g.
`/view?step=proposal`) without jumping ahead of its true state: `resolveScreen` takes the
highest-precedence rule whose rank is `<= cap` and whose `when` holds, else falls back to the
natural screen (so an unreached or unknown `step` is a no-op). Steps and ranks live in
`researcher-screen-rules.ts`; the reviewer role ignores `step`.

### Screen registry (`_screens/registry.ts`)

`SCREEN_COMPONENTS` maps every `ScreenId` (researcher **and** the six `reviewer-*` ids) to a React
component, typed as a total `Record<ScreenId, ScreenComponent>` so a missing screen is a **compile
error**, not a runtime throw. Both pages dispatch through the shared `renderStudyScreen` helper
(`_screens/render-screen.tsx`), which resolves the descriptor and awaits the mapped component
(screens may be async server components that load their own data):

```ts
// view/page.tsx → role: 'researcher'   |   review/page.tsx → role: 'reviewer'
return renderStudyScreen({ role, raw: rawStudyState, study, orgSlug, studyId, dashboardHref, returnTo })
```

The `reviewer-*` components are **thin adapters** over the existing reviewer views
(`ProposalReviewView`, `PostFeedbackView`, `CodeReview`, `StudyDetailsReviewer`, `AgreementsPage`) —
each fetches its own feedback/job data, exactly as the researcher screens do. Two `ScreenId`s share
a component on each side: `code-approved`/`code-feedback` → `CodeDecisionScreen` (researcher), and
`reviewer-code-feedback` branches internally on the decision for the reviewer.

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

Both roles are implemented. The resolvers take a `role` (`'researcher' | 'reviewer'`); `resolveScreen`
picks the matching rule table, and the pill/highlight resolvers already branch on role. The
**projection is shared and role-agnostic** — the reviewer flow reads the same `StudyState` facts
(notably `reviewerAgreementsAcked`, previously unused) and inherits all the order-independence
guarantees for free. Adding the reviewer flow was adding a rule table + adapters, not
re-architecting — exactly as the design intended.

### Reviewer routing (`/review`)

`/review` is pure state-machine dispatch, mirroring `/view`. The legacy `?from=`-keyed cascade and
**all** reviewer `?from=` values (`initial-request`, `code-review`, `agreements`,
`agreements-proceed`, `previous`) are gone. Notable pieces:

- **Shared guard** (`review/reviewer-page-guard.tsx`): both reviewer entry points run the same
  access preamble (session/org → study → lab-org redirect to `/view` → `isSubmittedStudy` →
  enclave-only), so a non-reviewer hitting either URL directly is handled identically.
- **Agreements gate as a screen**: the old redirect-to-`/agreements` is now the `reviewer-agreements`
  screen (rule #3). The reviewer branch of `agreements/page.tsx` became a plain revisitable step
  (no `?from=`), like the researcher branch.
- **Dedicated proposal route** (`/review/proposal`, `studyReviewProposal`): backs the "View approved
  initial request" link. It always shows the **decided** initial request regardless of code stage,
  and **falls through** to the canonical `/review` screen (e.g. editable proposal review) when the
  proposal isn't decided yet — so it never renders a blank page.

---

## File map

| File                             | Responsibility                                                                |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `state.types.ts`                 | `RawStudyState`, `StudyState`, `DashboardState`, `StudyRole`                  |
| `state.ts`                       | `projectStudyState` + priority constants                                      |
| `screens.ts`                     | `ScreenId` (researcher + `reviewer-*`), `ScreenDescriptor`, `DashboardAction` |
| `screen-rules.ts`                | `ScreenRule`, `ScreenRuleEntry`, `ScreenRuleCtx` (shared rule types)          |
| `researcher-screen-rules.ts`     | `RESEARCHER_SCREEN_RULES` (researcher table)                                  |
| `reviewer-screen-rules.ts`       | `REVIEWER_SCREEN_RULES` (reviewer table)                                      |
| `dashboard-rules.ts`             | `DASHBOARD_RULES` table                                                       |
| `resolve.ts`                     | `resolveScreen` (role-keyed), `resolveDashboardAction`                        |
| `pill.ts`                        | `resolvePillStatus`, `resolveRowHighlight`                                    |
| `index.ts`                       | public barrel                                                                 |
| `server/db/study-state-query.ts` | `rawStudyStateForStudy` — the single fetch                                    |
| `_screens/registry.ts`           | `SCREEN_COMPONENTS` id → component map (both roles)                           |
| `_screens/render-screen.tsx`     | `renderStudyScreen` — shared `/view` + `/review` dispatch                     |
| `_screens/reviewer-*-screen.tsx` | six reviewer adapters over existing reviewer views                            |
| `review/reviewer-page-guard.tsx` | shared reviewer access preamble                                               |
| `lib/review-decision.ts`         | status/`CODE-*` → `ReviewDecision` fallback maps                              |

Tests sit next to each module; `state.shuffle.test.ts` and `consistency.test.ts` enforce the
order-independence and cross-resolver-agreement invariants (the latter covers both roles).
