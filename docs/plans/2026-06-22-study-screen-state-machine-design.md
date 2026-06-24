# Study Screen State Machine — Design

**Date:** 2026-06-22
**Project:** SafeInsights management-app
**Status:** Design approved. Implementation plan: `2026-06-22-study-screen-state-machine-plan.md`

> Note on the code snippets below: rule-table entries use `/* … */` and
> `/* back/forward per spec */` as illustrative placeholders for button copy. The
> exact `title` strings and href/intent targets are transcribed verbatim from the
> product-spec table columns (Back Button Title/Logic, Forward Button Title/Logic,
> Modal) during implementation. The snippets show _structure and precedence_, which
> are the parts under design review; they are not meant to be the final literal copy.

---

## 1. Problem

The logic that decides **which screen, which panel, which buttons, and which status pill** a
researcher or reviewer sees for a study is spread across four places that each re-derive
overlapping state from incomplete inputs:

1. `src/hooks/use-study-href.ts` — the dashboard predicts _which URL_ to open
   (`/view`, `/code`, `/submitted`, `/edit`) from the partial `StudyRow` data it has.
2. `src/app/[orgSlug]/study/[studyId]/view/page.tsx` (~245 lines) — the researcher page
   re-derives state and picks among ~5 panel components via a nested if-cascade keyed on
   `?from=` query params and job-status ordering.
3. `src/app/[orgSlug]/study/[studyId]/review/page.tsx` (~250 lines) — the reviewer/DO page,
   a parallel if-cascade with its own `?from=` special cases.
4. `src/hooks/use-study-status.ts` (`useStudyStatus`) + `study-row.tsx`'s `shouldHighlight` —
   the dashboard pill and row emphasis, with their own `dropStaleCodeDecisions` /
   `latestCodeChangeIsSubmission` recency logic that must not drift from the routing in 1–3.

The real complexity (documented in the OTTER-ticket comments in `src/lib/study-job-status.ts`)
comes from:

- ~15 friendly statuses in the product spec collapsing onto a 6-value DB enum
  (`DRAFT | PENDING-REVIEW | CHANGE-REQUESTED | APPROVED | REJECTED | ARCHIVED`) **combined
  with** 14 job statuses and file presence.
- **Status rows can be written or delivered out of order.** `jobStatusChange.createdAt`
  defaults to `now()` (constant within a transaction, so sibling rows tie) and v7 UUIDs are
  not reliably monotonic within a millisecond; webhook statuses (`CODE-SCANNED`, results,
  execution) can also arrive late. So **reading "the latest status" (`statusChanges[0]`) is
  never safe**, and order-sensitive heuristics (counting submissions vs decisions, comparing
  indices) are fragile. Past bugs all trace to code that looked at the newest status instead
  of the whole set.
- `?from=` query params used to paper over the fact that one URL maps to many possible
  screens depending on how the user navigated there.

### Core invariant: statuses are read as an unordered _set_ (by existence/count), never by recency

The machine must treat a job's `statusChanges` as an **unordered set** and ask only
existence/count questions (`some(...)` / counting occurrences) — never "what is the newest
status" (`statusChanges[0]`). Concretely:

- A code-review decision is **in effect while it is the latest word on the latest job** — and
  whether it is "the latest word" is decided by **counting, not by reading the newest row**
  (which is unsafe — see below). Concretely (mirroring the battle-tested
  `latestSubmittedJobHasLiveCodeDecision` in `study-job-status.ts`): a decision on the latest job
  is **live** iff `decisionCount > 0 && decisionCount >= submittedCount` within that job, where
  `submittedCount` counts `CODE-SUBMITTED` and `decisionCount` counts decision statuses
  (`CODE-APPROVED`/`REJECTED`/`CODE-CHANGES-REQUESTED`). When live, `codeDecision` is the
  highest-priority decision present (APPROVED wins); otherwise `codeDecision` is `null` and the
  study reads as awaiting review.
    - **Why counting, not "is a decision present?":** the normal path opens a **new job** per round
      (so the latest job has exactly one round and counting is trivially "a decision is present").
      But **historical/defensive same-job shapes** exist — a single job carrying
      `CODE-SUBMITTED → decision → CODE-SUBMITTED` (a resubmission appended to the same job). There,
      a newer `CODE-SUBMITTED` tips `submittedCount` past `decisionCount`, so the decision is no
      longer live and the study correctly reads "under review again." Pure set-existence would
      wrongly keep it decided. **Counting handles both shapes and is order-independent** (it counts
      occurrences in the set, so it's permutation-invariant — verified by the shuffle test).
    - `CODE-APPROVED` is still "permanent" in the common case (no newer same-job submission ever
      follows it, because approval closes the round / a resubmission opens a new job). A late
      `CODE-SCANNED` or any non-submission row does **not** un-approve it (it doesn't change the
      counts). The nuance only bites the historical same-job resubmission shape.
- Results statuses (`FILES-APPROVED` / `FILES-REJECTED` / `RUN-COMPLETE` / `JOB-ERRORED`) are
  terminal-and-permanent for their job (pure set-existence — no counting needed).
- **Resubmission opens a brand-new `studyJob`** (a closed round is never reopened — see
  `getOrCreateCurrentRoundJob`, `mutations.ts`). So a multi-round study has multiple jobs, and
  **only the latest job feeds `StudyState`'s phase facts** — earlier rounds are history and
  contribute nothing (the lone cross-job fact is `submissionRound`, a count of rounds). "Which
  job is the latest" is resolved by **`max(studyJob.id)`** (v7 ids are monotonic with insertion
  order, matching the write side) — _not_ by reading any status timestamp. So the job-phase
  facts mean "the **latest** job has status X," never "**some** job has status X."
- The two axes therefore differ: **ordering across jobs matters** and is resolved by `id`;
  **ordering of statuses within the latest job does not matter** and is resolved by
  set-existence.

These rules are the whole reason the machine is worth building: encode them **once**, in the
projection, as latest-job selection (`max(id)`) plus set-existence within it, so no screen ever
re-derives them from "the newest status."

## 2. Goal

Replace the four scattered decision sites with **one auditable state machine** that takes
the full study state and returns the screen (and the dashboard's link, pill, and highlight) to
render. The machine must be:

- **Human-readable / auditable** — expressed as declarative, ordered JS rule tables, not an
  imperative if-cascade and not a statechart library (no xstate). The product spec's
  status table becomes the source code, more or less literally.
- **Pure** — no React, no DB, no Next imports in the core. Unit-testable with plain objects.
- **The single source of truth** — every screen/panel/button/label decision goes through it.

### Scope

- **Researcher flow now.** Design the input/output types and the resolver with a `role`
  dimension so the reviewer flow slots in later by adding a reviewer rule table — no
  re-architecture.
- **Cover the researcher results screens** (`RUN-COMPLETE` / `FILES-APPROVED` /
  `FILES-REJECTED` / `JOB-ERRORED`) from the existing implementation, even though those rows
  are blank in the product spec doc.
- The reviewer ("Data Partners") rules are **stubbed** for the later phase.

## 3. Architecture

A new self-contained pure module plus an app-layer rendering registry.

```
src/lib/study-screen/                 # PURE — no React/DB/Next imports
  state.types.ts     # RawStudyState (input), StudyState (flat projected context)
  state.ts           # projectStudyState(raw): StudyState
                     #   the ONLY place that reads statusChanges ordering / counts / raw rows
  screens.ts         # ScreenId union, ScreenDescriptor, ButtonDescriptor, ModalDescriptor, ScreenIntent
  dashboard-rules.ts # DASHBOARD_RULES: ordered [{ when, action }]   (Tier 1)
  screen-rules.ts    # SCREEN_RULES: ordered [{ when, screen }]      (Tier 2)
  resolve.ts         # resolveDashboardAction(role,state) + resolveScreen(role,state,step)
  pill.ts            # resolvePillStatus(role,state) + resolveRowHighlight(role,state) — reads status-labels.ts copy
  index.ts           # public surface
  *.test.ts          # co-located unit tests

src/app/[orgSlug]/study/[studyId]/_screens/   # RENDERING LAYER — React
  registry.ts              # SCREEN_COMPONENTS: Record<ScreenId, ScreenComponent>  (compiler-exhaustive)
  study-screen-renderer.tsx# <StudyScreenRenderer descriptor … /> — looks up component, wires buttons/modal
  intents.ts               # ScreenIntent → { action, modal copy }  — the one place intents meet server actions
  types.ts                 # ScreenComponentProps
```

**Boundary rule (the keystone):** `projectStudyState` is the _only_ function permitted to
read `statusChanges` ordering, counts, or raw job rows. Both rule tables read **only**
`StudyState` — never raw jobs. This quarantines all the race-condition / ordering logic into
one tested place.

### Data flow

```
Dashboard cell ──▶ projectStudyState(latestJobRaw) ──▶ resolveDashboardAction(role,state) → { label, href, secondaryAction? }
                                                       ├─▶ resolvePillStatus(role,state)     → status pill
                                                       └─▶ resolveRowHighlight(role,state)   → row emphasis
                                                                        │ (Link — URL only)
                                                                        ▼
/view or /review page ──▶ fetch full raw bundle ──▶ projectStudyState(fullRaw)
                                                          │
                                                          ▼
                                  resolveScreen(role, state, step) ──▶ ScreenDescriptor
                                                          │
                                                          ▼
                                  <StudyScreenRenderer descriptor>
                                      ├─ SCREEN_COMPONENTS[descriptor.screen] → panel
                                      └─ descriptor.back / forward / modal → buttons (route→Link, intent→action)
```

Three consumers (dashboard cell, researcher page, reviewer page); **none** re-derive state —
they all `projectStudyState` once and read resolvers. The dashboard cell runs three resolvers
off its one projection (link, pill, highlight). The two `page.tsx` cascades shrink to ~30 lines
each (fetch → project → resolve → render). `use-study-href.ts` and `use-study-status.ts`'s
selection logic are deleted; `study-action-link.tsx` and the row pill become pure renderers of
resolver output.

## 4. Input & state types

### RawStudyState (the fetched bundle)

```ts
type RawJob = {
    id: string
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date }> // newest-first as DB returns
    files: ReadonlyArray<{ fileType: StudyJobFileType }>
}

type RawStudyState = {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
    researcherAgreementsAckedAt: Date | null
    reviewerAgreementsAckedAt: Date | null
    language: Language | null
    jobs: ReadonlyArray<RawJob> // dashboard may pass a single synthesized job from jobStatusChanges
}
```

### StudyState (flat projected context — both rule tables read this)

Every field is a plain boolean / enum / number. No arrays to re-interpret.

**Two-axis rule for how the projection reads jobs — read carefully:**

1. **Across jobs → only the _latest_ job counts.** A study accrues one `studyJob` per review
   round (resubmission opens a new job); earlier rounds are history and must **not** contribute
   to `StudyState`. The job-phase facts below describe **the latest job only**. The latest job
   is selected by **`max(studyJob.id)`** — v7 ids are monotonic with insertion order, which is
   exactly how the write side picks the current round (`getOrCreateCurrentRoundJob` orders
   `studyJob.id desc`). Selecting by `id` is safe; selecting by a status timestamp is not.
2. **Within that latest job → statuses are an unordered _set_.** Ask existence
   (`statusChanges.some(s => s.status === X)`), **never `statusChanges[0]`**. A single job's
   rows can tie on `createdAt` or arrive late (e.g. a `CODE-SCANNED` webhook after the
   decision), so the newest row is not meaningful; the _presence_ of a status is.

So: **ordering across jobs matters (resolved by `id`); ordering of statuses inside the latest
job does not (resolved by set-existence).** The only legitimately cross-job fact is
`submissionRound` (a count of rounds), called out below.

```ts
type StudyState = {
    status: StudyStatus
    // proposal phase
    isDraft: boolean
    // Two explicit, parallel booleans — one per role — mapping 1:1 to the DB columns
    // (researcherAgreementsAckedAt / reviewerAgreementsAckedAt). Symmetric on purpose: rules
    // read whichever applies to their role with no value to interpret.
    researcherAgreementsAcked: boolean
    reviewerAgreementsAcked: boolean

    // job / code phase — set-existence over the LATEST job's statuses (latest = max studyJob.id)
    hasAnyJob: boolean
    hasSubmittedCode: boolean // latest job has CODE-SUBMITTED
    // codeDecision is PERMANENT once present on the latest job: CODE-APPROVED | CODE-REJECTED |
    // CODE-CHANGES-REQUESTED. APPROVED wins if several ever coexist on the job (it never un-sets).
    codeDecision: CodeDecisionStatus | null
    // latest job has CODE-SUBMITTED but no decision status yet (set-existence, not statusChanges[0]).
    codeAwaitingDecision: boolean
    isExecuting: boolean // latest job has JOB-PROVISIONING/PACKAGING/READY/RUNNING

    // results phase — existence over the LATEST job (each terminal status is permanent for it)
    hasResults: boolean // latest job has any of RUN-COMPLETE/FILES-APPROVED/FILES-REJECTED/JOB-ERRORED
    resultsApproved: boolean // latest job has FILES-APPROVED
    resultsRejected: boolean // latest job has FILES-REJECTED
    resultsErrored: boolean // latest job has JOB-ERRORED
    // A single value for display only, chosen by a FIXED precedence in the projection
    // (e.g. APPROVED > REJECTED > ERRORED > RUN-COMPLETE) — NOT by array order. The booleans
    // above are the source of truth for branching; this is convenience for the results screen.
    resultsDisplayStatus: 'RUN-COMPLETE' | 'FILES-APPROVED' | 'FILES-REJECTED' | 'JOB-ERRORED' | null

    // bookkeeping — the one cross-job fact
    submissionRound: number // count of jobs that have a CODE-SUBMITTED status (1 = first round)
    hasSavedEdits: boolean // for the "if there are saved edits" rows (see §12 open question)

    // dashboard status PILL — see §7 resolvePillStatus. The pill needs finer granularity than
    // the screen booleans above (which collapse e.g. all execution into isExecuting), so the
    // projection also exposes the single status the pill should display: the highest-priority
    // status PRESENT on the latest job, with stale code decisions dropped on a resubmission,
    // falling back to `status` when the job has no statuses yet. Computed once, by set-existence
    // + a fixed priority order — NOT statusChanges[0]. resolvePillStatus maps it to copy; the
    // screen rules ignore it. This replaces useStudyStatus's array-walking + dropStaleCodeDecisions.
    displayStatus: AllStatus // StudyJobStatus | StudyStatus
}
```

`projectStudyState` is the **only** place these are computed. It selects the latest job by
`max(id)` once, then reuses the _existence-based_ helpers already in the codebase — `hasJobStatus`
(`study-job-status.ts`), `canResubmitStudyCode` / `CODE_RESUBMITTABLE_JOB_STATUSES`
(`code-resubmission.ts`), and the existing status-group constants (`STUDY_RESULTS_JOB_STATUSES`,
`STUDY_CODE_RUNNING_JOB_STATUSES`, `CODE_DECISION_JOB_STATUSES`) — against that one job's status
set. `submissionRound` is the lone exception that scans all jobs.

Note on the helpers being retired: `latestSubmittedJobHasLiveCodeDecision`,
`latestSubmittedJobLiveCodeDecisionStatus`, and `latestCodeChangeIsSubmission` exist today to
work around order-dependence with submission/decision counting — a workaround that was needed
precisely because they anchored on "the latest _submitted_ job" rather than simply the latest
job. Under the corrected model they are unnecessary: pick the latest job by `id`, then
`codeDecision` and `codeAwaitingDecision` are plain set-existence questions on its statuses.
The projection replaces those helpers rather than re-homing them; their behavior is folded into
the fields above and covered by the shuffle/permutation tests in §11.

The dashboard **status pill** and **row highlight** move onto the projection too (so
`StudyState` becomes the single source for everything the dashboard shows). `useStudyStatus`'s
array-walking and its `dropStaleCodeDecisions` / `JOB-ERRORED`-hiding logic are folded into
`displayStatus` (computed in the projection) plus `resolvePillStatus` (§7); `shouldHighlight`'s
`latestCodeChangeIsSubmission` call becomes a one-line predicate over `StudyState`. This retires
the **last** callers of `latestCodeChangeIsSubmission` — once the pill, highlight, reviewer
routing, and screen selection all read `StudyState`, the order-dependent helpers have no users
left and are deleted.

### DashboardState (compiler-enforced subset)

The dashboard's studies-table query (`study.actions.ts`) already returns the **latest job by
`max(id)` and its full status set** (a `latestStudyJob` CTE feeds `jobStatusChanges`). So every
**latest-job, status-derived** fact in `StudyState` is computable on the dashboard:
`codeDecision`, `codeAwaitingDecision`, `isExecuting`, the results booleans, and `displayStatus`
— which is exactly what the pill and highlight need. The dashboard runs the **same**
`projectStudyState` over its (single-latest-job) `RawStudyState`.

Only two `StudyState` facts are **not** available from that query:

- `submissionRound` — needs **all** jobs; the dashboard query fetches only the latest. (The
  dashboard doesn't need it — no dashboard element labels "resubmission" — so the query is not
  extended.)
- `hasSavedEdits` — comment-derived; not fetched on the dashboard path.

`DashboardState` therefore is **`StudyState` minus those two**, encoded as an `Omit` so the
compiler stops any dashboard-tier code (Tier-1 rule, pill, highlight) from reading a fact the
dashboard can't populate:

```ts
type DashboardState = Omit<StudyState, 'submissionRound' | 'hasSavedEdits'>
```

(Not the tiny subset an earlier draft assumed — once the pill and highlight moved onto the
projection, the dashboard legitimately needs nearly all of `StudyState`. The boundary that
matters is the two genuinely-unavailable facts, which `Omit` pins down.)

## 5. Output types

```ts
type ScreenId =
    // researcher proposal flow
    | 'proposal-edit' // draft, editing (Step 1A / Step 2 via `step`)
    | 'proposal-submitted' // under review (1st or resubmission)
    | 'proposal-feedback' // change-requested / approved / rejected read-only proposal
    | 'agreements' // IRB / SoW / agreements page
    // researcher code flow
    | 'code-upload' // code draft, editing
    | 'code-under-review' // code submitted, awaiting decision
    | 'code-approved' // decision = approved (incl. executing window)
    | 'code-feedback' // code change-requested / rejected read-only
    | 'code-edit' // editing after change-requested
    // results
    | 'study-results' // results exist
    // fallback
    | 'study-overview' // generic details (the current bottom-of-page default)

type ScreenIntent = 'submit-proposal' | 'resubmit-proposal' | 'submit-code' | 'resubmit-code'

type ButtonDescriptor = {
    title: string // "Previous Step", "Proceed to Step 3", "Go to dashboard"
    target:
        | { kind: 'route'; href: Route } // pure navigation — machine computes the href
        | { kind: 'intent'; intent: ScreenIntent } // mutating action — renderer wires to the server action
}

type ModalDescriptor = {
    intent: ScreenIntent // e.g. 'submit-code' opens its confirm modal
}

type ScreenDescriptor = {
    screen: ScreenId
    step?: string // position within a multi-step screen, mirrors URL segment
    back?: ButtonDescriptor // "Back Button" column in the product spec
    forward?: ButtonDescriptor // "Forward Button" column
    modal?: ModalDescriptor // "Modal Triggered?" column
}
```

**Route vs intent split** is how the machine stays pure: navigation buttons carry a concrete
href the machine computes; mutating buttons (submit/resubmit, which open confirm modals) carry
a named **intent**. The machine never imports a server action — it just names one. The
renderer's `intents.ts` maps `ScreenIntent → { action, modal copy }` (the single place client
intents meet server actions).

## 6. The rule tables

### Tier 2 — `SCREEN_RULES` (ordered, first-match-wins; order = precedence)

Directly transcribes the product spec's researcher rows; results precedence is drawn from the
existing code (results before decision before under-review).

Every `when` reads only the flat, already-disambiguated `StudyState`, so the table is
order-independent by construction. The row order encodes **display precedence**, a deliberate
product decision — not a guess about which status is "newest." A recorded `codeDecision` sits
**above** `codeAwaitingDecision` because, on a single job, a decision is permanent (§Core
invariant) and should win over any sibling/awaiting status on that same job. Note the
resubmission flow follows naturally from "latest job only": when the researcher resubmits, a
**new** job is created with `CODE-SUBMITTED` and no decision, so for the new latest job
`codeDecision` is `null` and `codeAwaitingDecision` is `true` — the study correctly reads as
"under review again" with no special-casing, because the prior decided round is no longer the
latest job and contributes nothing.

```ts
const SCREEN_RULES: ScreenRule[] = [
    // Results exist → results screen. Highest precedence: results are terminal & permanent.
    { when: (s) => s.hasResults, screen: (s) => ({ screen: 'study-results' /* back/forward per spec */ }) },

    // Code approved (incl. the post-approval execution window). codeDecision is permanent.
    {
        when: (s) => s.codeDecision === 'APPROVED' || s.isExecuting,
        screen: () => ({ screen: 'code-approved' /* … */ }),
    },

    {
        when: (s) => s.codeDecision === 'CHANGES-REQUESTED',
        screen: () => ({ screen: 'code-feedback', forward: { title: 'Edit and resubmit' /* … */ } }),
    },

    { when: (s) => s.codeDecision === 'REJECTED', screen: () => ({ screen: 'code-feedback' /* … */ }) },

    // Current round submitted, no decision on it yet (set-existence on the max-id job).
    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'code-under-review' /* … */ }) },

    // approved proposal, in the code-draft / agreements span
    {
        when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode,
        screen: (s) => ({ screen: s.researcherAgreementsAcked ? 'code-upload' : 'agreements' /* … */ }),
    },

    // proposal under review
    { when: (s) => s.status === 'PENDING-REVIEW', screen: () => ({ screen: 'proposal-submitted' /* … */ }) },

    {
        when: (s) => s.status === 'CHANGE-REQUESTED',
        screen: () => ({ screen: 'proposal-feedback', forward: { title: 'Edit and resubmit' /* … */ } }),
    },

    {
        when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED',
        screen: () => ({ screen: 'proposal-feedback' /* … */ }),
    },

    // draft, still editing
    { when: (s) => s.isDraft, screen: () => ({ screen: 'proposal-edit', step: 'data-org' /* … */ }) },

    // exhaustive fallback
    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
```

`step` (read from the URL) refines _within_ a screen — e.g. `proposal-edit` at `data-org` vs
`proposal` selects which back/forward pair the descriptor carries (the "Step 1A → Step 2"
rows). An unknown/invalid step falls back to the screen's first step.

### Tier 1 — `DASHBOARD_RULES` (ordered)

```ts
type DashboardAction = {
    label: string // "Edit" | "View" | "Continue upload"
    href: Route
    secondaryAction?: 'delete-draft' // declared here; component still enforces author/permission
}

const DASHBOARD_RULES: DashboardRule[] = [
    {
        when: (s) => s.isDraft,
        action: (ctx) => ({ label: 'Edit', href: Routes.studyEdit(ctx), secondaryAction: 'delete-draft' }),
    },

    {
        when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode,
        action: (ctx) => ({ label: 'Continue upload', href: Routes.studyCode(ctx) }),
    },

    { when: () => true, action: (ctx) => ({ label: 'View', href: Routes.studyView(ctx) }) },
]
```

(`ctx` carries `orgSlug` / `studyId` for href building; the `when` predicates read only
`DashboardState`.) The machine _declares_ the `delete-draft` affordance; the component still
enforces the author/permission check (`session.user.id === study.researcherId`). Permissions
stay in the component; presentation logic moves into the machine.

## 7. Rendering layer

### Registry — `SCREEN_COMPONENTS` (compiler-exhaustive)

```ts
import type { ScreenId } from '@/lib/study-screen'

type ScreenComponent = React.ComponentType<ScreenComponentProps>

export const SCREEN_COMPONENTS: Record<ScreenId, ScreenComponent> = {
    'proposal-edit': ProposalEditScreen,
    'proposal-submitted': ProposalSubmittedScreen,
    'proposal-feedback': ProposalFeedbackScreen,
    agreements: AgreementsScreen,
    'code-upload': CodeUploadScreen,
    'code-under-review': CodeUnderReviewScreen,
    'code-approved': CodeApprovedScreen,
    'code-feedback': CodeFeedbackScreen,
    'code-edit': CodeEditScreen,
    'study-results': StudyResultsScreen,
    'study-overview': StudyOverviewScreen,
}
```

`Record<ScreenId, …>` is **exhaustive by compiler**: add a `ScreenId` and the registry fails
to typecheck until mapped. The machine and renderer cannot drift.

### Dashboard pill & highlight — pure resolvers over `StudyState`

These two are **pure** (no React) and live in `src/lib/study-screen/` beside `resolveScreen`,
not in this rendering layer — they take `StudyState` and return data, and the dashboard cell
renders that data.

```ts
// pill: maps StudyState.displayStatus to the {stage,label,colors,tooltip} from status-labels.ts,
// applying the role-specific rule that researchers don't see "Errored" until the reviewer has
// recorded a FILES-* decision (today's JOB-ERRORED-hiding, now expressed on facts not an array).
resolvePillStatus(role, state): StatusLabel

// highlight: "does this row need this role's attention?" — replaces shouldHighlight's
// latestCodeChangeIsSubmission call with a flat read.
//   reviewer:   state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
//   researcher: state.resultsApproved
resolveRowHighlight(role, state): boolean
```

`status-labels.ts` keeps the copy (it is presentation, not facts); `resolvePillStatus` is the
selection logic that used to live in `useStudyStatus`. `useStudyStatus` either becomes a thin
wrapper that projects then calls `resolvePillStatus`, or is removed in favor of a direct call —
decided in writing-plans. The pill's status **precedence** (which present status wins) stays its
own ordering, distinct from the screen rules' precedence, and is unit-tested in the same
shuffle/table style as `resolveScreen`.

### Renderer — `<StudyScreenRenderer>`

~10 lines: look up `SCREEN_COMPONENTS[descriptor.screen]`, render it with the descriptor plus
study/job data; render `descriptor.back`/`forward` (route → `<Link>`, intent → action-wired
button) and `descriptor.modal` via `intents.ts`.

### Component adaptation

Existing components (`ResearcherProposalView`, `StudyDetailsResearcher`, `CodeUploadPage`,
`CodePostDecisionView`, `CodePostSubmissionView`, results views, etc.) are **adapted** into the
`ScreenComponentProps` shape, not rewritten. They mostly lose their hand-built
`previousHref` / `?from=` wiring (the machine now supplies `descriptor.back`/`forward`) and
accept the descriptor instead.

## 8. Routing changes

**Goal: delete `?from=` entirely (researcher side) — it is the documented source of the routing
bugs.** `?from=` exists only because today no single authority decides "what screen should this
study show," so each page guesses and patches itself with defensive redirects, and `?from=` is
the escape hatch on those patches. `resolveScreen` becomes that authority, which lets the whole
structure collapse.

Resolved during planning (verified against the code, supersedes the earlier "`step` segment" idea):

- **No `step` URL segment is needed.** The researcher `/view` page never renders a multi-step
  screen: the draft proposal steps are already **separate routes** (`/edit` = Step 1, `/proposal`
  = Step 2). Every screen `resolveScreen` returns for `/view` is a single page; the draft case
  just points its forward/back at those existing routes. The `ScreenDescriptor.step` field stays
  as harmless metadata (breadcrumb labels) but drives no routing.
- **Two distinct `?from=` categories, both removed (researcher side):**
    - _Category 1 — screen selection_ (`?from=agreements`, `?from=code-decision` in `view/page.tsx`;
      and the `previousHref`/`agreementsHref` that produce them in the view components). These make
      the **same study state** render **different screens** — exactly what `resolveScreen` replaces.
      Deleted: the machine computes each screen's `back`/`forward` as real route hrefs.
    - _Category 2 — redirect suppression_ (`?from=step2` on `/edit`, `?from=previous` on
      `/agreements`). These suppress a page's defensive "resume/skip-forward" auto-redirect on
      intentional back-navigation (OTTER-572). **Both the auto-redirects AND these flags are
      deleted** — not renamed. They only exist because pages guess; once the machine is the
      authority, pages don't self-correct, so there is nothing to suppress.
- **Two route kinds — canonical-only vs revisitable (refinement after discovering `/agreements`
  is deliberately re-viewable):**
    - **Canonical-only — `/view`:** state-resolved. `resolveScreen` picks the screen; `/view`
      always shows the canonical screen for the study's state. The if-cascade dies here.
    - **Revisitable steps — `/agreements`, `/code`, and the draft `/edit` + `/proposal`:** these are
      destinations a researcher can navigate to directly, forward OR backward, even when they are no
      longer the study's "canonical" screen (e.g. viewing agreements after acking them). They render
      their own content for an authorized researcher **without** a "is this canonical?" redirect.
      No `?from=` needed — they simply stop redirecting. This is what makes "Previous Step →
      /agreements" work without a signal: the agreements page just renders.
    - The only redirect that remains is each revisitable page's **pre-existing, non-`?from=`
      authorization/eligibility guard** (e.g. `/edit` already requires DRAFT status — keep that;
      only the `?from=step2` _resume_ redirect is deleted). A `redirectUnlessCanonical` helper is
      therefore needed for **few or no** pages — most just delete their `?from=`-gated redirects.
- **Consequence for back-links:** a screen's "Previous Step" may target a revisitable route
  (`/agreements`) and it just works. It may NOT target `/view` expecting a _non-canonical_ screen
  (that self-loops, since `/view` re-resolves to the canonical screen). The `study-results` screen
  therefore has **no back button** (its legacy "Previous" forced the code-approved page via
  `?from=code-decision` on `/view` — unexpressible without a signal, and results is terminal in the
  product spec anyway).
- Dashboard links unconditionally to `/view` (researcher) via the Tier-1 href; it no longer
  predicts a panel.
- **`definitions.ts` changes (require explicit approval per CLAUDE.md):** drop the `from` param
  from the researcher routes (`studyView`, `studyEdit`, `studyAgreements`) — `returnTo` stays.
  The reviewer routes keep `from` (the reviewer page is a separate, later migration).
- **Reviewer side is untouched** in this plan: `review/page.tsx`'s `?from=` (`initial-request`,
  `code-review`, `agreements`, `agreements-proceed`) and its routes remain until the reviewer
  flow is migrated.

## 9. Invariants & error handling

- **Tier-1/Tier-2 consistency:** a test asserts every `href` Tier-1 can emit, when followed,
  produces a _non-fallback_ `resolveScreen` result for the same state. The two tiers can never
  silently disagree on the route.
- **Exhaustive fallback:** `SCREEN_RULES` ends with `when: () => true → 'study-overview'`, so
  `resolveScreen` is total — it always returns a descriptor.
- **Registry exhaustiveness:** enforced by `Record<ScreenId, …>` at compile time.
- **Invalid step:** falls back to the screen's first step rather than erroring.
- **Corrupt/missing data:** `projectStudyState` tolerates empty `jobs` (→ all job/results
  facts false); the page's not-found / access-denied guards stay where they are today
  (the machine assumes the study exists and the viewer is authorized — authz is not its job).

## 10. Data fetching (requirement, details deferred)

- A single query per entry point assembles `RawStudyState` — no N+1, no multiple round-trips.
  The full-state fetch (`/view`, `/review`) returns study + **every job** + **every
  `statusChange`** + `files` in **one** round-trip, using the `jsonArrayFrom` aggregation
  pattern from `latestJobForStudyQuery`. **Note:** that existing query is single-job
  (`limit(1)`, ordered `createdAt desc`); the new query orders **jobs by `id desc`** and the
  projection takes the latest job from that set. It fetches **all** jobs rather than `limit(1)`
  so `submissionRound` can count rounds and so correctness doesn't hinge on SQL picking the one
  right row — but only the **latest** job's statuses drive the phase facts. (Today's pages fire
  ~4 separate calls: `getStudyAction` + `latestSubmittedJobForStudy` +
  `countSubmittedJobsForStudy` + `getCodeReviewFeedbackAction`.)
- **Order-independence:** correctness must not depend on the SQL row order. The projection
  selects the latest job by `max(id)` and treats that job's `statusChanges` as a set — so a
  status row arriving late, or two rows tying on `createdAt`, cannot change the result, and the
  `jobs` / `statusChanges` arrays may arrive in any order.
- The dashboard already fetches its latest-job bundle in the studies-table query;
  `DashboardState` is projected from what that query **already returns** — zero added queries
  on the dashboard path.
- **Shared artifact is the projection, not the data.** The dashboard and the `/view` `/review`
  pages are **separate route requests**: RSC data does not survive the `<Link>` navigation, so
  the page **re-fetches** rather than receiving the dashboard's data. This is also correct on
  purpose — the dashboard list can be stale by click time (a decision or results may have
  landed), and the page needs the _full_ bundle the dashboard deliberately skips. So each entry
  point fetches independently, fresh and right-sized; what they share is the same
  `projectStudyState` (and the page's `resolveScreen`) — the **rules**, not the rows. Do not
  smuggle study state through the URL or storage to "save" the page's query.
- Exact columns, joins, and aggregation shapes are an implementation detail for writing-plans.

## 11. Testing

- **Pure unit tests** (the bulk): table-driven over `projectStudyState`, `resolveScreen`, and
  `resolveDashboardAction` with plain `RawStudyState` / `StudyState` objects. One assertion per
  product-spec row: given a state, expect a specific `ScreenDescriptor` (screen + back/forward
  titles + modal). Follows CONVENTIONS (vitest, `@/tests/unit.helpers`, co-located `.test.ts`).
- **Order-independence (shuffle) test — the headline guard:** for each `projectStudyState`
  fixture, assert the projected `StudyState` is **identical** under every permutation of each
  job's `statusChanges` **and** of the `jobs` array (shuffle both, re-project, deep-equal).
  Shuffling `jobs` proves latest-job selection uses `id` (not array position or `createdAt`);
  shuffling `statusChanges` proves the per-job facts use set-existence (not `statusChanges[0]`).
  It fails if any fact ever reads the newest row or depends on row order. Includes the specific
  past-bug shapes:
    - a late `CODE-SCANNED` appended after `CODE-APPROVED` on the latest job → must stay
      `codeDecision === 'APPROVED'`;
    - a results status written alongside a sibling status on the latest job → still `hasResults`;
    - a multi-round study where an older job is decided/approved and the **newest** job (max id)
      has only a fresh `CODE-SUBMITTED` → must read `codeDecision === null` and
      `codeAwaitingDecision === true` (the older round contributes nothing — latest job only),
      regardless of the order jobs appear in the array.
- **Decision-permanence test:** a latest job whose status set contains `CODE-APPROVED` projects
  `codeDecision === 'APPROVED'` regardless of what else (or how many other rows) sit on that job.
- **Pill & highlight tests:** table-driven over `resolvePillStatus` and `resolveRowHighlight`,
  one assertion per role × state → expected `StatusLabel` / boolean. Must port the existing
  `useStudyStatus` cases that today live in `use-study-status` / dashboard tests — especially:
  researcher does **not** see "Errored" until a reviewer records `FILES-APPROVED`/`FILES-REJECTED`;
  a resubmission (fresh `CODE-SUBMITTED` on the new latest job) shows the **Code-stage**
  "Needs Review" pill, not the prior round's "Change requested"; and the execution sub-statuses
  (`JOB-PACKAGING`/`JOB-READY`/`JOB-RUNNING`) keep their distinct pill labels (the reason
  `displayStatus` is finer-grained than `isExecuting`). Include the shuffle assertion: pill and
  highlight are identical under status/job permutation.
- **Invariant test:** Tier-1 ↔ Tier-2 route consistency (section 9).
- **Registry exhaustiveness:** compile-time (no runtime test needed).
- **Component/page tests:** the existing `view/page.test.tsx`, `study-action-link.test.tsx`,
  etc. are updated to assert the rendered panel/label for representative states, now that
  selection flows through the machine. Per project rules: do not mock our own components or
  actions; assert against the DB where a test exercises a server path.

## 12. Open questions for writing-plans

1. **`hasSavedEdits` source.** The "Edit Initial Request _(if there are saved edits)_" and
   "Edit Study Code _(if there are saved edits)_" rows need a concrete predicate. Likely
   derives from `studyProposalComment` `RESUBMISSION-NOTE` rows (see `study-request.ts:793`,
   `study.actions.ts:923`) or a draft field — verify against the schema during planning.
2. **Step vocabulary.** Enumerate the exact `step` values per multi-step screen
   (`proposal-edit`: `data-org` → `proposal`; `code-edit`; agreements) and whether each is a
   path segment or sub-route. Touches `definitions.ts` → needs approval.
3. **Reviewer rule table.** Out of scope now; the product spec's Data Partners table is empty.
   The types and `role` dimension are built to accept it without rework.
4. **Results screen back/forward.** The product spec's "Results under review / approved" rows
   are blank; transcribe behavior from the existing `StudyDetailsResearcher` /
   `JobResultsStatusMessage` implementation.

## 13. Out of scope

- Reviewer ("Data Partners") rule encoding (later phase; types ready for it).
- Any change to server actions' behavior — the machine names intents; actions are unchanged.
- Permission/authz logic — stays in components and the existing `permissions.ts`.
