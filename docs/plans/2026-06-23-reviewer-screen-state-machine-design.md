# Reviewer Screen State Machine — Design

**Date:** 2026-06-23
**Project:** SafeInsights management-app (finishing PR #826)
**Status:** Design approved. Implementation plan to follow.
**Builds on:** `2026-06-22-study-screen-state-machine-design.md` (researcher flow, already merged on
this branch), `docs/study-screens-logic.md`.

> Source of truth for the screen-by-status behaviour: the product **Front-End Logic Log**
> (Research Lab + Data Partners tables). Reviewer = "Data Partners" (DO) role.

---

## 1. Problem & goal

PR #826 introduced a study-screen **state machine** (`src/lib/study-screen/`) and migrated the
**researcher** flow onto it: `projectStudyState` → `resolveScreen`/`resolveDashboardAction`/
`resolvePillStatus`/`resolveRowHighlight`, rendered through a compiler-exhaustive
`SCREEN_COMPONENTS` registry. The researcher `?from=` routing cascade is gone.

The **reviewer** ("Data Partners" / DO) flow was explicitly left **stubbed and out of scope**:

- `resolveScreen` falls through to the researcher table for `role === 'reviewer'`
  (`resolve.ts`: `const rules = SCREEN_RULES`).
- `src/app/[orgSlug]/study/[studyId]/review/page.tsx` is an untouched ~250-line if-cascade keyed
  on four `?from=` values (`initial-request`, `code-review`, `agreements`, `agreements-proceed`).

**Goal:** finish PR #826 by giving the reviewer flow the same treatment the researcher flow got —
a reviewer rule table, reviewer screens, `/review` as pure state-machine dispatch, and full
elimination of the reviewer `?from=` cascade.

### Scope (decided in brainstorming)

- **Full reviewer migration**, matching the researcher end state.
- **Dedicated proposal route** for the "View approved initial request" new-tab link (replaces
  `from=initial-request`). Touches `definitions.ts` → **gated on explicit approval**.
- **Agreements ack modelled as a screen** (`reviewer-agreements`), not a redirect.
- **No `?from=` on the reviewer side** — all four values removed.
- **Routing / state-machine only.** Content-level Logic-Log gaps (auto-save copy, resubmission
  word counts, PI/Researcher hover tooltips, v1.0/v2.0 version labels, AI-summary collapse,
  security-scan log layout, etc.) are **out of scope** — separate follow-up tickets.

### Architecture choice

**Role-keyed rule tables over a shared projection** (the design doc's stated extension path:
"adding a reviewer rule table, not re-architecting"). `projectStudyState` is unchanged; both roles
read the same `StudyState`. Rejected: a separate `study-screen/reviewer/` module (duplicates the
resolver/test harness) and a unified table with a role-guard column (interleaves two different
precedence orders — loses the "the table _is_ the spec" auditability).

---

## 2. Projection — unchanged

`projectStudyState` stays exactly as-is. The reviewer flow needs only facts that already exist:

- `status` — `PENDING-REVIEW | APPROVED | REJECTED | CHANGE-REQUESTED`
- `hasSubmittedCode`, `codeAwaitingDecision`, `codeDecision`
- `reviewerAgreementsAcked` — already projected from `reviewerAgreementsAckedAt`; **currently
  unused**, becomes load-bearing for the reviewer agreements gate.
- `hasResults`

No new projection facts, no new query. The reviewer side inherits all of the projection's
order-independence guarantees (latest job by `max(id)`, set-existence within it) for free — the
race-condition logic stays quarantined in the one tested place.

---

## 3. Reviewer screen union & registry

The `ScreenId` union gains six `reviewer-`-prefixed ids (the prefix keeps the mixed researcher +
reviewer union auditable):

```ts
export type ScreenId =
    // researcher (unchanged)
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'study-results'
    | 'study-overview'
    // reviewer (new)
    | 'reviewer-proposal-review' // PENDING-REVIEW: editable proposal review
    | 'reviewer-proposal-feedback' // proposal decided, no code: read-only
    | 'reviewer-agreements' // code submitted, agreements not acked: the gate
    | 'reviewer-code-review' // code submitted, acked, awaiting decision
    | 'reviewer-code-feedback' // code decided: read-only
    | 'reviewer-study-results' // results exist
```

`SCREEN_COMPONENTS` (`_screens/registry.ts`) stays a total `Record<ScreenId, ScreenComponent>`, so
each new id **must** be mapped or it is a **compile error**.

The mapped components are **thin adapters** over the existing reviewer views — adapted into the
`ScreenComponentProps` shape, **not** rewritten:

| ScreenId                     | Wraps existing                     |
| ---------------------------- | ---------------------------------- |
| `reviewer-proposal-review`   | `ProposalReviewView` (editable)    |
| `reviewer-proposal-feedback` | `PostFeedbackView` `kind=PROPOSAL` |
| `reviewer-agreements`        | agreements gate (see §4)           |
| `reviewer-code-review`       | `CodeReview`                       |
| `reviewer-code-feedback`     | `PostFeedbackView` `kind=CODE`     |
| `reviewer-study-results`     | `StudyDetailsReviewer`             |

Each adapter loses its hand-built `?from=`/`previousHref` wiring; like the researcher screens, each
leaf view owns its own back/forward.

**Decision-fallback synthesis moves into the leaf adapters, not the projection.** Today the page
synthesizes a `ReviewDecision` for `PostFeedbackView` when no comment row exists — from the study
status (`PROPOSAL_STATUS_TO_REVIEW_DECISION`) or the job's `CODE-*` status
(`CODE_DECISION_TO_REVIEW_DECISION`). That synthesis belongs in the `reviewer-proposal-feedback` /
`reviewer-code-feedback` adapters: they fetch their own feedback entries and compute the fallback,
exactly as the researcher feedback screens fetch their own data. The projection stays clean.

---

## 4. `REVIEWER_SCREEN_RULES` (the heart)

Ordered, first-match-wins; order = display precedence. Every `when` reads **only** `StudyState`, so
the table is order-independent by construction. This transcribes the current `review/page.tsx`
cascade with the `?from=` cases removed (those are routing concerns, §5 — not screen-selection).

```ts
export const REVIEWER_SCREEN_RULES: ScreenRule[] = [
    // 1. Results exist → results-only Study Details (OTTER-538). Terminal & permanent, so it
    //    out-ranks the code decision (CODE-APPROVED is always present once results land).
    { when: (s) => s.hasResults, screen: () => ({ screen: 'reviewer-study-results' }) },

    // 2. A live code decision was recorded → read-only code post-feedback (OTTER-552).
    //    Covers approved / rejected / changes-requested; the leaf branches on codeDecision.
    { when: (s) => s.codeDecision !== null, screen: () => ({ screen: 'reviewer-code-feedback' }) },

    // 3. Code submitted, awaiting a decision, agreements NOT acked → the gate screen. Sits ABOVE
    //    code-review: a reviewer must ack before the active review page renders.
    {
        when: (s) => s.codeAwaitingDecision && !s.reviewerAgreementsAcked,
        screen: () => ({ screen: 'reviewer-agreements' }),
    },

    // 4. Code submitted, awaiting a decision, agreements acked → active code review.
    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'reviewer-code-review' }) },

    // 5. Proposal decided but no code yet → read-only proposal feedback.
    {
        when: (s) =>
            !s.hasSubmittedCode &&
            (s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'CHANGE-REQUESTED'),
        screen: () => ({ screen: 'reviewer-proposal-feedback' }),
    },

    // 6. Proposal under review → editable proposal review.
    { when: (s) => s.status === 'PENDING-REVIEW', screen: () => ({ screen: 'reviewer-proposal-review' }) },

    // 7. Exhaustive fallback. DRAFT shouldn't reach a reviewer (the page's not-found guard handles
    //    it), but the table stays total; study-overview is a safe read-only render.
    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
```

**Precedence, faithful to the current cascade:**

- **Results above code-decision** (#1 > #2) — mirrors `decisionMade = hasLiveCodeDecision &&
!hasResultsStatus` (page line 128): once results land, `CODE-APPROVED` is always present, so
  results must win.
- **Code-decision above agreements/review** (#2 > #3,#4) — OTTER-552: a decided study lands on
  post-feedback, not the active review page.
- **Agreements gate above active review** (#3 > #4) — models the current redirect-to-`/agreements`
  as a screen.
- **Proposal-feedback gated on `!hasSubmittedCode`** (#5) — matches `isSubmittedProposalReviewStatus`
  only being reached when `codeSubmitted` is false in the current cascade.

`resolve.ts` changes its stub from `const rules = SCREEN_RULES` to
`const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : SCREEN_RULES`.

**Guards that STAY in the page** (authz/eligibility, not screen-selection — like the researcher
`/edit` DRAFT guard the design doc kept):

- session/org check → `AccessDeniedAlert`
- `lab`-type org viewing `/review` → `redirect(Routes.studyView(...))` (page line 68)
- non-submitted study → `AlertNotFound`

The rule table assumes an authorized reviewer on a submitted study.

---

## 5. Routing changes

### `renderStudyScreen` — shared dispatch helper

Both `/view` and `/review` repeat project → resolve → look-up → render. Distil it into one tested
helper so each page is a one-liner after its guards:

```ts
// src/app/[orgSlug]/study/[studyId]/_screens/render-screen.tsx
export async function renderStudyScreen(args: {
    role: StudyRole
    raw: RawStudyState
    study: Submitted<SelectedStudy>
    orgSlug: string
    studyId: string
    step?: string
}): Promise<ReactNode> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw), args.step, {
        orgSlug: args.orgSlug,
        studyId: args.studyId,
        returnTo: args.returnTo, // preserve the researcher /view returnTo passthrough
    })
    const Screen = SCREEN_COMPONENTS[descriptor.screen]
    return await Screen({ descriptor, ...args })
}
```

(`returnTo` is added to the `args` type alongside the others, optional. The reviewer path passes
none; the researcher `/view` path threads its existing `returnTo` through unchanged so no behaviour
is lost in the refactor.)

Each page after its authz/eligibility guards:

```ts
// review/page.tsx
return renderStudyScreen({ role: 'reviewer', raw, study, orgSlug, studyId })
// view/page.tsx  (researcher dispatch refactored onto the same helper)
return renderStudyScreen({ role: 'researcher', raw, study, orgSlug, studyId })
```

The ~250-line `?from=`-keyed reviewer cascade is **deleted**.

### `?from=` removal — all four values

| Old `?from=`         | New mechanism                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `initial-request`    | **Dedicated route** `/review/proposal` (below) — always renders proposal feedback, no param. |
| `code-review`        | Gone — `/review` re-resolves to `reviewer-code-feedback` directly once a decision exists.    |
| `agreements`         | Gone — absorbed by `reviewer-agreements` screen + revisitable `/agreements`.                 |
| `agreements-proceed` | Gone — the gate is now a screen, so there is nothing to suppress.                            |

The reviewer branch of **`agreements/page.tsx`** is a fifth `?from=` surface (`from=previous`
gating direct access; `from=agreements`/`agreements-proceed` on its proceed/previous hrefs). Once the
gate is a `/review` screen, that branch becomes a plain revisitable step (like the researcher branch
already is): it drops the `?from=`-gated redirect-when-acked and emits `from`-less hrefs. All reviewer
`?from=` usage is then gone.

### Dedicated proposal route (gated on approval)

Add `studyReviewProposal: /${orgSlug}/study/${studyId}/review/proposal`. Its page always renders
the reviewer proposal-feedback screen (the decided/approved initial request) **regardless of code
stage**. The "View approved initial request" link points here and opens in a new tab as before.
This replaces `from=initial-request`.

### `definitions.ts` changes — **require explicit approval per CLAUDE.md**

1. **Add** `studyReviewProposal` route.
2. **Drop** the `from` param from `studyReview` (mirrors the researcher `from`-removal).

These are **gated steps**: the implementer must get explicit go-ahead before editing
`definitions.ts`. The plan calls this out as a checkpoint.

### Dead code removal

`ProposalReviewFromAgreementsView` (and its `.test.tsx`) become unreferenced — its job (show the
proposal when a reviewer backs out of agreements) is now served by the `reviewer-agreements` screen
and the dedicated proposal route. Delete once nothing references them.

---

## 6. Testing & invariants

**Pure unit tests (the bulk)** — table-driven, plain `RawStudyState`/`StudyState` literals,
co-located `.test.ts`, vitest from `@/tests/unit.helpers`:

- **`resolveScreen('reviewer', …)`** — one assertion per rule row, plus the precedence boundaries:
    - `hasResults` + `CODE-APPROVED` present → `reviewer-study-results` (results out-rank decision)
    - `codeDecision` present, not results → `reviewer-code-feedback` (not active review)
    - `codeAwaitingDecision` + `!reviewerAgreementsAcked` → `reviewer-agreements` (gate before review)
    - `codeAwaitingDecision` + acked → `reviewer-code-review`
    - decided proposal, `!hasSubmittedCode` → `reviewer-proposal-feedback`
    - `PENDING-REVIEW` → `reviewer-proposal-review`
    - resubmission shape (new latest job, fresh `CODE-SUBMITTED`, prior round decided) → back to
      `reviewer-code-review`, **not** the stale decision (inherited from the shared projection;
      asserted explicitly for the reviewer path).

- **Order-independence** — the projection's `state.shuffle.test.ts` already proves permutation
  invariance; reviewer rules read the same `StudyState`, so no new shuffle test is needed. Add a
  reviewer assertion to the shuffle fixtures' expectations so a regression in reviewer-relevant
  facts (`reviewerAgreementsAcked`, `codeDecision`) is caught.

**Consistency invariant (`consistency.test.ts`) extends to reviewers** — assert every reviewer
screen the rule table can emit is mapped in `SCREEN_COMPONENTS` (compile-time already, but assert
no reachable reviewer state falls through to the `study-overview` fallback), and that
`resolvePillStatus('reviewer', …)` / `resolveRowHighlight('reviewer', …)` don't contradict the
resolved screen for the same state.

**Page/component tests** — `review/page.test.tsx` (~37KB, asserting the old `?from=` cascade) is
**rewritten** to assert, per representative state, which screen renders. No mocking of our own
components/actions; exercise the real DB path where the page fetches. The `?from=` cases are
deleted. `renderStudyScreen` gets a focused role → screen dispatch test. Dead-code tests
(`proposal-review-from-agreements-view.test.tsx`) are removed with their component.

**Registry exhaustiveness** — compile-time via `Record<ScreenId, …>`; the six new ids force their
mappings or the build fails. No runtime test needed.

**Validation gates** (CONVENTIONS) — `pnpm run lint:fix`, `pnpm run test:unit`, `pnpm run checks`
must pass before finishing.

---

## 7. Out of scope

- Content-level Logic-Log conformance (tooltips, word counts, version labels, auto-save copy,
  AI-summary/security-scan layout) — separate tickets.
- Any change to server actions' behaviour — screens name the same actions; actions are unchanged.
- Permission/authz logic — stays in components and `permissions.ts`.
- Reviewer dashboard _link_ destination changes beyond what `resolveDashboardAction` already does
  (the reviewer dashboard already routes to `/review`; pill/highlight already take `role`).
