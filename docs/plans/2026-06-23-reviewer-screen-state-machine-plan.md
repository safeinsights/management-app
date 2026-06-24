# Reviewer Screen State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish PR #826 by migrating the reviewer ("Data Partners") flow onto the existing study-screen state machine — a reviewer rule table, six reviewer screens, `/review` as pure dispatch, and full removal of the reviewer `?from=` cascade.

**Architecture:** Role-keyed rule tables over the **unchanged** shared `projectStudyState`. A new `REVIEWER_SCREEN_RULES` table is selected by `role` in `resolve.ts`; six `reviewer-*` `ScreenId`s join the compiler-exhaustive `SCREEN_COMPONENTS` registry, mapped to thin adapter components that wrap the existing reviewer views. A shared `renderStudyScreen` helper collapses both `/view` and `/review` to one-line dispatch.

**Tech Stack:** TypeScript, Next.js App Router (RSC), React, Mantine, Kysely, vitest (`@/tests/unit.helpers`), Routes from `@/lib/routes`.

**Design:** `docs/plans/2026-06-23-reviewer-screen-state-machine-design.md`

---

## Notes for the implementer (read first)

- **Pure module:** `src/lib/study-screen/` has **no React/DB/Next imports**. Tasks 1–4 (types, rules, resolver, consistency) stay pure. Only the `_screens/` adapters and the page (Tasks 5–11) touch React/DB.
- **`projectStudyState` is NOT modified.** Reviewer rules read only facts that already exist on `StudyState`: `status`, `hasSubmittedCode`, `codeAwaitingDecision`, `codeDecision`, `reviewerAgreementsAcked`, `hasResults`.
- **`ScreenComponentProps` shape (existing — match it exactly):**
    ```ts
    // src/app/[orgSlug]/study/[studyId]/_screens/types.ts
    export type ScreenComponentProps = {
        descriptor: ScreenDescriptor
        study: SelectedStudy
        raw: RawStudyState
        orgSlug: string
        dashboardHref: string
        returnTo?: 'org'
    }
    ```
    There is **no `studyId` prop** — use `study.id`.
- **Adapter screens fetch their own data** (feedback entries, review version, job), exactly like the researcher screens do. The decision-fallback synthesis (status → `ReviewDecision`, `CODE-*` → `ReviewDecision`) lives **in the adapters**, not the projection.
- **`StudyForReview = Submitted<SelectedStudy>`** (`review/review-types.ts`). The page guards with `isSubmittedStudy(study)` so adapters receive the narrowed type.
- **Gated step (Task 9):** editing `src/lib/routes/definitions.ts` requires **explicit user approval** per CLAUDE.md. Stop and ask before Task 9.
- **Run from repo root.** Unit tests: `pnpm run test:unit`. Type+lint+actions: `pnpm run checks`. Fix lint with `pnpm run lint:fix`. Ask before committing (CLAUDE.md); the commit steps below assume you have a standing OK to commit each task — if not, batch and ask.
- **Reviewer dashboard link needs no change:** `study-action-link.tsx`'s `ReviewerLink` already links to `Routes.studyReview` with label "View", no `?from=`. Leave it.

---

## File Structure

**Pure module (`src/lib/study-screen/`):**

- Modify `screens.ts` — add six `reviewer-*` ids to `ScreenId`.
- Create `reviewer-screen-rules.ts` — `REVIEWER_SCREEN_RULES`.
- Create `reviewer-screen-rules.test.ts` — table-driven reviewer resolution tests.
- Modify `resolve.ts` — select the table by `role`.
- Modify `consistency.test.ts` — add reviewer fall-through assertion.

**Rendering layer (`src/app/[orgSlug]/study/[studyId]/_screens/`):**

- Create `render-screen.tsx` — shared `renderStudyScreen` dispatch helper.
- Create six adapter screens: `reviewer-proposal-review-screen.tsx`, `reviewer-proposal-feedback-screen.tsx`, `reviewer-agreements-screen.tsx`, `reviewer-code-review-screen.tsx`, `reviewer-code-feedback-screen.tsx`, `reviewer-study-results-screen.tsx`.
- Modify `registry.ts` — map the six new ids.

**Pages / routes:**

- Modify `review/page.tsx` — collapse cascade to `renderStudyScreen` dispatch + guards.
- Rewrite `review/page.test.tsx` — per-state screen assertions.
- Modify `view/page.tsx` — refactor onto `renderStudyScreen` (no behaviour change).
- Modify `definitions.ts` (**gated**) — add `studyReviewProposal`, drop `from` from `studyReview`.
- Create `review/proposal/page.tsx` — dedicated proposal-feedback route.
- Delete `proposal-review-from-agreements-view.tsx` + its test (dead code).
- Modify `study-details-reviewer.tsx` — rework the `from: 'code-review'` previousHref.

---

## Task 1: Add reviewer ScreenIds to the union

**Files:**

- Modify: `src/lib/study-screen/screens.ts:3-9`

- [ ] **Step 1: Extend the `ScreenId` union**

In `src/lib/study-screen/screens.ts`, replace the `ScreenId` definition:

```ts
export type ScreenId =
    // researcher
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'study-results'
    | 'study-overview'
    // reviewer
    | 'reviewer-proposal-review'
    | 'reviewer-proposal-feedback'
    | 'reviewer-agreements'
    | 'reviewer-code-review'
    | 'reviewer-code-feedback'
    | 'reviewer-study-results'
```

- [ ] **Step 2: Run typecheck to confirm the registry now fails to compile**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `_screens/registry.ts` — `Record<ScreenId, ScreenComponent>` is missing the six new keys. This is the compiler-exhaustiveness guard working; Task 7 maps them. (Do not commit a broken build — Tasks 1–7 land together at Task 7's commit, OR add temporary placeholder mappings if committing per task. Simplest: proceed to Task 2; the build goes green at Task 7.)

---

## Task 2: Write the reviewer screen-rules test (failing)

**Files:**

- Create: `src/lib/study-screen/reviewer-screen-rules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/study-screen/reviewer-screen-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen } from './resolve'

const ctx = { orgSlug: 'org', studyId: '01900000-0000-7000-8000-000000000001' }

// Minimal StudyState factory — same shape as consistency.test.ts's `full`.
const st = (overrides: Partial<StudyState>): StudyState => ({
    status: 'PENDING-REVIEW',
    isDraft: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: false,
    hasSubmittedCode: false,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 0,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'PENDING-REVIEW',
    latestJobStatuses: [],
    ...overrides,
})

const screen = (s: StudyState) => resolveScreen('reviewer', s, undefined, ctx).screen

describe('resolveScreen(reviewer)', () => {
    it('PENDING-REVIEW → reviewer-proposal-review', () => {
        expect(screen(st({ status: 'PENDING-REVIEW' }))).toBe('reviewer-proposal-review')
    })

    it('decided proposal, no code → reviewer-proposal-feedback', () => {
        expect(screen(st({ status: 'APPROVED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'REJECTED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'CHANGE-REQUESTED' }))).toBe('reviewer-proposal-feedback')
    })

    it('code submitted, agreements NOT acked → reviewer-agreements (gate before review)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    reviewerAgreementsAcked: false,
                }),
            ),
        ).toBe('reviewer-agreements')
    })

    it('code submitted, agreements acked → reviewer-code-review', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    reviewerAgreementsAcked: true,
                }),
            ),
        ).toBe('reviewer-code-review')
    })

    it('live code decision → reviewer-code-feedback (not active review)', () => {
        for (const d of ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED'] as const) {
            expect(screen(st({ status: 'APPROVED', hasSubmittedCode: true, codeDecision: d }))).toBe(
                'reviewer-code-feedback',
            )
        }
    })

    it('results out-rank a present code decision → reviewer-study-results', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsApproved: true,
                }),
            ),
        ).toBe('reviewer-study-results')
    })

    it('resubmission (fresh submit, no live decision) → back to reviewer-code-review, not stale feedback', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    codeDecision: null,
                    reviewerAgreementsAcked: true,
                }),
            ),
        ).toBe('reviewer-code-review')
    })

    it('agreements gate only applies while awaiting decision (acked-irrelevant once decided)', () => {
        // A decided study with agreements never acked still shows feedback, not the gate.
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    reviewerAgreementsAcked: false,
                }),
            ),
        ).toBe('reviewer-code-feedback')
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/lib/study-screen/reviewer-screen-rules.test.ts`
Expected: FAIL — `resolveScreen('reviewer', …)` currently uses the researcher table (returns e.g. `study-overview` / `proposal-feedback`), so the reviewer-prefixed expectations do not match.

---

## Task 3: Implement `REVIEWER_SCREEN_RULES`

**Files:**

- Create: `src/lib/study-screen/reviewer-screen-rules.ts`

- [ ] **Step 1: Create the rule table**

Create `src/lib/study-screen/reviewer-screen-rules.ts`:

```ts
import type { ScreenRule } from './screen-rules'

// Reviewer ("Data Partners" / DO) Tier-2 rules. Order = display precedence. First match wins.
// Every `when` reads only StudyState, so the table is order-independent by construction.
// Transcribes the legacy review/page.tsx cascade with the ?from= cases removed (those are routing,
// not screen-selection). See docs/plans/2026-06-23-reviewer-screen-state-machine-design.md §4.
export const REVIEWER_SCREEN_RULES: ScreenRule[] = [
    // 1. Results exist → results-only Study Details (OTTER-538). Out-ranks the code decision
    //    (CODE-APPROVED is always present once results land), mirroring legacy
    //    `decisionMade = hasLiveCodeDecision && !hasResultsStatus`.
    { when: (s) => s.hasResults, screen: () => ({ screen: 'reviewer-study-results' }) },

    // 2. A live code decision was recorded → read-only code post-feedback (OTTER-552). The leaf
    //    branches internally on codeDecision (approved / rejected / changes-requested).
    { when: (s) => s.codeDecision !== null, screen: () => ({ screen: 'reviewer-code-feedback' }) },

    // 3. Code submitted, awaiting a decision, agreements NOT acked → the gate screen. Above
    //    code-review: the reviewer must ack before the active review page renders.
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

- [ ] **Step 2: Verify `ScreenRule` is exported from `screen-rules.ts`**

Run: `grep -n "export type ScreenRule\|export type ScreenRuleCtx" src/lib/study-screen/screen-rules.ts`
Expected: both `ScreenRule` and `ScreenRuleCtx` are exported (they are — confirmed in the design). If `ScreenRule` is not exported, add `export` to its declaration.

---

## Task 4: Wire the reviewer table into `resolveScreen`

**Files:**

- Modify: `src/lib/study-screen/resolve.ts:13-15`

- [ ] **Step 1: Select the table by role**

In `src/lib/study-screen/resolve.ts`, replace the stub:

```ts
// Reviewer rules are not yet implemented (spec §13). Until then, reviewer falls through to
// the researcher table's fallback so callers never crash; the reviewer page is NOT migrated
// in this plan and does not call resolveScreen.
const rules = SCREEN_RULES
```

with:

```ts
const rules = role === 'reviewer' ? REVIEWER_SCREEN_RULES : SCREEN_RULES
```

- [ ] **Step 2: Add the import**

At the top of `resolve.ts`, alongside the existing `import { SCREEN_RULES, … }`, add:

```ts
import { REVIEWER_SCREEN_RULES } from './reviewer-screen-rules'
```

- [ ] **Step 3: Run the reviewer rules test — now passes**

Run: `pnpm exec vitest run src/lib/study-screen/reviewer-screen-rules.test.ts`
Expected: PASS (all cases).

- [ ] **Step 4: Run the full pure-module suite to confirm no researcher regression**

Run: `pnpm exec vitest run src/lib/study-screen`
Expected: PASS — researcher tests, shuffle, consistency all still green (the researcher branch is unchanged).

---

## Task 5: Extend the consistency invariant to reviewers

**Files:**

- Modify: `src/lib/study-screen/consistency.test.ts`

- [ ] **Step 1: Add a reviewer fall-through assertion**

Append a new `describe` block to `src/lib/study-screen/consistency.test.ts` (reuse the existing `full` factory already in that file):

```ts
describe('reviewer rule table reaches no accidental fallback', () => {
    // Every reviewer-reachable state must resolve to a reviewer-* screen, never the
    // study-overview fallback (which would mean a missing reviewer rule).
    const reviewerStates: StudyState[] = [
        full({ status: 'PENDING-REVIEW', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false }),
        full({ status: 'REJECTED', isDraft: false }),
        full({ status: 'CHANGE-REQUESTED', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeAwaitingDecision: true }),
        full({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeAwaitingDecision: true,
            reviewerAgreementsAcked: true,
        }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-APPROVED' }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-CHANGES-REQUESTED' }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true }),
    ]

    for (const s of reviewerStates) {
        it(`reviewer status=${s.status} code=${s.codeDecision} → reviewer screen`, () => {
            const id = resolveScreen('reviewer', s, undefined, ctx).screen
            expect(id.startsWith('reviewer-')).toBe(true)
        })
    }
})
```

- [ ] **Step 2: Run consistency test**

Run: `pnpm exec vitest run src/lib/study-screen/consistency.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit the pure-module changes**

```bash
git add src/lib/study-screen/screens.ts src/lib/study-screen/reviewer-screen-rules.ts \
  src/lib/study-screen/reviewer-screen-rules.test.ts src/lib/study-screen/resolve.ts \
  src/lib/study-screen/consistency.test.ts
git commit -m "feat(study-screen): reviewer SCREEN_RULES + role-keyed resolveScreen"
```

(Note: the build still fails typecheck until the registry maps the new ids — Task 7. If your workflow requires a green build per commit, defer this commit to fold into Task 7's commit.)

---

## Task 6: Build the six reviewer adapter screens

Each adapter wraps an existing reviewer view in the `ScreenComponentProps` shape and fetches its own data. They are server components (async where they fetch).

**Files:**

- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-proposal-review-screen.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-proposal-feedback-screen.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-agreements-screen.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-code-review-screen.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-code-feedback-screen.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/reviewer-study-results-screen.tsx`

- [ ] **Step 1: `reviewer-proposal-review-screen.tsx` (editable PENDING-REVIEW)**

```tsx
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { currentReviewVersion } from '@/server/db/queries'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { ProposalReviewView } from '../review/proposal-review-view'
import type { ScreenComponentProps } from './types'

// PENDING-REVIEW: the editable proposal-review page. reviewVersion MUST come from
// currentReviewVersion (not from the entries action) so an entries failure can't silently
// downgrade the editor's Yjs room — see the legacy comment in review/page.tsx.
export async function ReviewerProposalReviewScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const reviewVersion = await currentReviewVersion(study.id)
    const entries = await getProposalFeedbackForStudyAction({ studyId: study.id })
    const priorEntries = isActionError(entries) ? [] : entries
    return (
        <ProposalReviewView orgSlug={orgSlug} study={study} priorEntries={priorEntries} reviewVersion={reviewVersion} />
    )
}
```

- [ ] **Step 2: `reviewer-proposal-feedback-screen.tsx` (decided proposal, read-only)**

```tsx
import type { ReviewDecision, StudyStatus } from '@/database/types'
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

// A decided proposal doesn't always carry a feedback comment (approve/reject can write the
// decision on the study without a comment). Synthesize a decision from status so the view renders
// the decided proposal instead of a blank PostFeedbackView.
const PROPOSAL_STATUS_TO_REVIEW_DECISION: Partial<Record<StudyStatus, ReviewDecision>> = {
    APPROVED: 'APPROVE',
    REJECTED: 'REJECT',
    'CHANGE-REQUESTED': 'NEEDS-CLARIFICATION',
}

export async function ReviewerProposalFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getProposalFeedbackForStudyAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    const decision = PROPOSAL_STATUS_TO_REVIEW_DECISION[study.status]
    const fallback = decision
        ? { decision, timestamp: study.approvedAt ?? study.rejectedAt ?? study.createdAt }
        : undefined
    return <PostFeedbackView orgSlug={orgSlug} study={study} entries={safeEntries} fallback={fallback} />
}
```

- [ ] **Step 3: `reviewer-code-review-screen.tsx` (active code review)**

```tsx
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { CodeReview } from '../review/code-review'
import type { ScreenComponentProps } from './types'

// Active code review. CodeReview fetches its own job + scan results; it only needs prior
// code-review entries (present only when a prior round exists → triggers the resubmission variant).
// Swallow a feedback fetch error so it degrades to the first-submission view, not a blocked page.
export async function ReviewerCodeReviewScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    return <CodeReview orgSlug={orgSlug} study={study} entries={safeEntries} />
}
```

- [ ] **Step 4: `reviewer-code-feedback-screen.tsx` (code decided, read-only)**

```tsx
import type { ReviewDecision } from '@/database/types'
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { isCodeDecisionStatus, type CodeDecisionStatus } from '@/lib/study-job-status'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

// A code decision can be written (proposal approve/reject path) without a code-review comment, so
// synthesize the decision from the job's CODE-* status when no comment rows exist — keeps the page
// on the code post-feedback view rather than blanking out.
const CODE_DECISION_TO_REVIEW_DECISION: Record<CodeDecisionStatus, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}

export async function ReviewerCodeFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const job = await latestSubmittedJobForStudy(study.id)
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries

    if (safeEntries.length > 0) {
        return <PostFeedbackView orgSlug={orgSlug} study={study} entries={safeEntries} kind="CODE" job={job} />
    }
    const fallbackStatus = job?.statusChanges.find((s) => isCodeDecisionStatus(s.status))
    const fallback =
        fallbackStatus && isCodeDecisionStatus(fallbackStatus.status)
            ? {
                  decision: CODE_DECISION_TO_REVIEW_DECISION[fallbackStatus.status],
                  timestamp: fallbackStatus.createdAt,
              }
            : undefined
    return <PostFeedbackView orgSlug={orgSlug} study={study} entries={[]} kind="CODE" job={job} fallback={fallback} />
}
```

- [ ] **Step 5: `reviewer-study-results-screen.tsx` (results, read-only)**

```tsx
import { StudyDetailsReviewer } from '../review/study-details-reviewer'
import type { ScreenComponentProps } from './types'

// Results-only Study Details (OTTER-538). StudyDetailsReviewer fetches its own job and renders
// AlertNotFound when there is none.
export function ReviewerStudyResultsScreen({ study, orgSlug }: ScreenComponentProps) {
    return <StudyDetailsReviewer orgSlug={orgSlug} study={study} />
}
```

- [ ] **Step 6: `reviewer-agreements-screen.tsx` (agreements gate as a screen)**

The gate previously redirected to `/agreements`. Modelled as a screen, it renders the existing
`AgreementsPage` component (`../agreements/agreements-page`) inline for the reviewer. That component
already supports the reviewer via the props `isReviewer`, `studyId`, `proceedHref`, `previousHref`,
`previousLabel` — confirmed in `agreements/page.tsx`. The screen supplies **`from`-less** hrefs:
`proceedHref` → the bare review route (which re-resolves to `reviewer-code-review` once acked),
`previousHref` → the dashboard.

Create `reviewer-agreements-screen.tsx`:

```tsx
import { Stack, Title } from '@mantine/core'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'
import { AgreementsPage } from '../agreements/agreements-page'
import type { ScreenComponentProps } from './types'

// Reviewer agreements gate, modelled as a screen (not a redirect). Acking proceeds into code
// review (the bare /review re-resolves to reviewer-code-review once reviewerAgreementsAckedAt is
// set); Previous returns to the dashboard. No ?from= — the screen authority decides the next view.
export function ReviewerAgreementsScreen({ study, orgSlug, dashboardHref }: ScreenComponentProps) {
    const reviewHref = Routes.studyReview({ orgSlug, studyId: study.id })
    return (
        <Stack p="xl" gap="xl">
            <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer
                studyId={study.id}
                proceedHref={reviewHref}
                previousHref={dashboardHref}
                previousLabel="Previous"
            />
        </Stack>
    )
}
```

> Confirm `AgreementsPage`'s prop names against `agreements/agreements-page.tsx` before writing
> (Run: `grep -n "isReviewer\|proceedHref\|previousHref\|previousLabel\|studyId" "src/app/[orgSlug]/study/[studyId]/agreements/agreements-page.tsx" | head`). The reviewer
> branch of `agreements/page.tsx` already calls it with exactly these props, so reuse is clean.

- [ ] **Step 7: Typecheck the adapters (registry still unmapped — expect only the registry error)**

Run: `pnpm exec tsc --noEmit 2>&1 | grep -v registry.ts | head -30`
Expected: no errors _other than_ the registry missing-keys error from Task 1. If an adapter has a prop/type mismatch, fix it against the real component signature.

---

## Task 7: Map the reviewer screens in the registry

**Files:**

- Modify: `src/app/[orgSlug]/study/[studyId]/_screens/registry.ts`

- [ ] **Step 1: Import and map the six adapters**

Add imports and extend `SCREEN_COMPONENTS`:

```ts
import { ReviewerProposalReviewScreen } from './reviewer-proposal-review-screen'
import { ReviewerProposalFeedbackScreen } from './reviewer-proposal-feedback-screen'
import { ReviewerAgreementsScreen } from './reviewer-agreements-screen'
import { ReviewerCodeReviewScreen } from './reviewer-code-review-screen'
import { ReviewerCodeFeedbackScreen } from './reviewer-code-feedback-screen'
import { ReviewerStudyResultsScreen } from './reviewer-study-results-screen'

export const SCREEN_COMPONENTS: Record<ScreenId, ScreenComponent> = {
    'code-approved': CodeDecisionScreen,
    'code-feedback': CodeDecisionScreen,
    'code-under-review': CodeUnderReviewScreen,
    'proposal-feedback': ProposalFeedbackScreen,
    'study-results': StudyResultsScreen,
    'study-overview': StudyOverviewScreen,
    'reviewer-proposal-review': ReviewerProposalReviewScreen,
    'reviewer-proposal-feedback': ReviewerProposalFeedbackScreen,
    'reviewer-agreements': ReviewerAgreementsScreen,
    'reviewer-code-review': ReviewerCodeReviewScreen,
    'reviewer-code-feedback': ReviewerCodeFeedbackScreen,
    'reviewer-study-results': ReviewerStudyResultsScreen,
}
```

- [ ] **Step 2: Typecheck — build is now green**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. The `Record<ScreenId, …>` is satisfied.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/_screens/"
git commit -m "feat(study-screen): reviewer screen adapters + registry mappings"
```

---

## Task 8: Add the shared `renderStudyScreen` helper and refactor `/view`

**Files:**

- Create: `src/app/[orgSlug]/study/[studyId]/_screens/render-screen.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/view/page.tsx`

- [ ] **Step 1: Create the helper**

Create `src/app/[orgSlug]/study/[studyId]/_screens/render-screen.tsx`:

```tsx
import type React from 'react'
import { projectStudyState, resolveScreen, type RawStudyState, type StudyRole } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { SCREEN_COMPONENTS } from './registry'

// Shared dispatch for both /view (researcher) and /review (reviewer): project → resolve → look up
// → render. Screens are awaited (not JSX children) so async server components resolve in the test
// harness, matching the pattern the page used inline before this helper existed.
export async function renderStudyScreen(args: {
    role: StudyRole
    raw: RawStudyState
    study: SelectedStudy
    orgSlug: string
    studyId: string
    dashboardHref: string
    returnTo?: 'org'
    step?: string
}): Promise<React.JSX.Element> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw), args.step, {
        orgSlug: args.orgSlug,
        studyId: args.studyId,
        returnTo: args.returnTo,
    })
    const Screen = SCREEN_COMPONENTS[descriptor.screen]
    return (await Screen({
        descriptor,
        study: args.study,
        raw: args.raw,
        orgSlug: args.orgSlug,
        dashboardHref: args.dashboardHref,
        returnTo: args.returnTo,
    })) as React.JSX.Element
}
```

- [ ] **Step 2: Refactor `view/page.tsx` onto the helper**

Replace the body of `view/page.tsx` after the data fetch with a `renderStudyScreen` call:

```tsx
import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'

export default async function StudyView(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    const study = actionResult(await getStudyAction({ studyId }))
    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    return renderStudyScreen({
        role: 'researcher',
        raw: rawStudyState,
        study,
        orgSlug,
        studyId,
        dashboardHref: dashboardHref as string,
        returnTo,
    })
}
```

- [ ] **Step 3: Run the researcher view page tests — unchanged behaviour**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx"`
Expected: PASS — the refactor is behaviour-preserving; all existing researcher view assertions still hold.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/_screens/render-screen.tsx" \
  "src/app/[orgSlug]/study/[studyId]/view/page.tsx"
git commit -m "refactor(study-screen): shared renderStudyScreen dispatch; /view uses it"
```

---

## Task 9 (GATED — get explicit approval before editing definitions.ts): Routes

**Files:**

- Modify: `src/lib/routes/definitions.ts`

> **STOP.** CLAUDE.md requires explicit approval before changing `src/lib/routes/definitions.ts`. Present these two diffs to the user and wait for go-ahead.

- [ ] **Step 1: Get approval, then drop `from` from `studyReview`**

Replace the `studyReview` definition (currently `StudyParams.extend({ from: z.string().optional() })`, building a `?from=` query) with a plain study route:

```ts
studyReview: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review`, StudyParams),
```

- [ ] **Step 2: Add the dedicated proposal route**

Add alongside `studyReview`:

```ts
studyReviewProposal: makeRoute(
    ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review/proposal`,
    StudyParams,
),
```

- [ ] **Step 3: Typecheck — surfaces every remaining `from:` caller on the reviewer routes**

Run: `pnpm exec tsc --noEmit 2>&1 | head -40`
Expected: errors at each site still passing `from` to `Routes.studyReview(...)` (e.g. `study-details-reviewer.tsx`, and any reviewer view back-links). These are fixed in Task 10. List them — they are the exact set of reviewer `?from=` callers to clean up.

---

## Task 10: Collapse `review/page.tsx` to dispatch; remove reviewer `?from=`

**Files:**

- Modify: `src/app/[orgSlug]/study/[studyId]/review/page.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/review/study-details-reviewer.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/agreements/page.tsx` (reviewer branch — drop `?from=` round-trip)
- Create: `src/app/[orgSlug]/study/[studyId]/review/proposal/page.tsx`
- Delete: `src/app/[orgSlug]/study/[studyId]/review/proposal-review-from-agreements-view.tsx`
- Delete: `src/app/[orgSlug]/study/[studyId]/review/proposal-review-from-agreements-view.test.tsx`

- [ ] **Step 1: Replace the reviewer page body with guards + dispatch**

Rewrite `review/page.tsx` to keep the authz/eligibility guards and dispatch through the helper:

```tsx
'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { isSubmittedStudy } from '@/schema/study'
import { getStudyAction } from '@/server/actions/study.actions'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { renderStudyScreen } from '../_screens/render-screen'

export default async function StudyReviewPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) return <AccessDeniedAlert />

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // A lab member who lands on /review belongs on the researcher /view of the submitting org.
    if (currentOrg.type === 'lab') {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    // Reviewer dashboards filter DRAFT studies, but a direct URL could still hit this route.
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    if (currentOrg.type !== 'enclave') {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    return renderStudyScreen({
        role: 'reviewer',
        raw,
        study,
        orgSlug,
        studyId,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })
}
```

> Confirm the import depth (`../../_screens/render-screen`) resolves: `review/page.tsx` is at `study/[studyId]/review/`, the helper at `study/[studyId]/_screens/`, so `../_screens/render-screen` is correct from `review/`. Use `../_screens/render-screen`. (Adjust if the editor's path resolution disagrees.)

- [ ] **Step 2: Create the dedicated proposal route**

Create `review/proposal/page.tsx` — always renders the reviewer proposal-feedback screen regardless of code stage (this is what the "View approved initial request" new-tab link opens):

```tsx
'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { isSubmittedStudy } from '@/schema/study'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { ReviewerProposalFeedbackScreen } from '../../_screens/reviewer-proposal-feedback-screen'

export default async function ReviewProposalPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params
    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) return <AccessDeniedAlert />

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study || !isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    return (await ReviewerProposalFeedbackScreen({
        descriptor: { screen: 'reviewer-proposal-feedback' },
        study,
        raw: { status: study.status } as never, // proposal-feedback adapter reads only study + actions; raw unused
        orgSlug,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })) as React.JSX.Element
}
```

> The `raw` cast is a smell. Prefer fetching the real bundle: `const raw = await rawStudyStateForStudy(studyId)` and pass it, matching the other pages. Replace the `as never` line with the real fetch if the adapter ever reads `raw`. Verify `ReviewerProposalFeedbackScreen` does not read `raw` (per Task 6 Step 2 it does not) — if it does, fetch the bundle here.

- [ ] **Step 3: Point "View approved initial request" at the new route**

Find the link that previously used `from: 'initial-request'`:

Run: `grep -rn "initial-request" "src/app/[orgSlug]/study/[studyId]/review/"`
Expected: the `SubmittedCodeSection` / code-review view's "View approved initial request" anchor. Change its href to `Routes.studyReviewProposal({ orgSlug, studyId })`, keeping `target="_blank"`.

- [ ] **Step 4: Rework `study-details-reviewer.tsx` previousHref**

In `study-details-reviewer.tsx`, replace:

```ts
const previousHref = Routes.studyReview({ orgSlug, studyId: study.id, from: 'code-review' })
```

with the `from`-less review route (the page re-resolves to `reviewer-code-feedback` once a decision exists, which is the intended "Previous" destination):

```ts
const previousHref = Routes.studyReview({ orgSlug, studyId: study.id })
```

- [ ] **Step 5: Simplify the reviewer branch of `agreements/page.tsx`**

The reviewer branch currently uses `?from=` for its round-trip (`from === 'previous'` to allow
direct access, and `proceedHref`/`previousHref` carrying `from=agreements-proceed`/`from=agreements`).
With the gate modelled as a `/review` screen (`ReviewerAgreementsScreen`), the **reviewer branch of
this page is now only reachable as a revisitable step** — so, like the researcher branch already
does, it should render without the `?from=`-gated redirect-when-acked and without emitting
`?from=` hrefs.

In `agreements/page.tsx`, in the `if (isReviewer)` block:

- Remove the `isDirectAccess`/`from === 'previous'` logic and the `study.reviewerAgreementsAckedAt && !isDirectAccess` redirect (the `/review` screen authority now decides canonical; this page just renders for an authorized reviewer).
- Keep the "no code submitted → redirect to /review" guard (eligibility, not `?from=`).
- Change the `AgreementsPage` hrefs to `from`-less:

```tsx
return (
    <Stack p="xl" gap="xl">
        <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
        <Title order={1}>Study request</Title>
        <AgreementsPage
            isReviewer
            studyId={studyId}
            proceedHref={Routes.studyReview({ orgSlug, studyId })}
            previousHref={Routes.studyReview({ orgSlug, studyId })}
            previousLabel="Previous"
        />
    </Stack>
)
```

> This mirrors the researcher revisitable-step treatment already in the same file. If the reviewer
> agreements page has its own test asserting the `?from=` hrefs, update it in Task 11 Step 4.

- [ ] **Step 6: Delete the dead from-agreements view + test**

```bash
git rm "src/app/[orgSlug]/study/[studyId]/review/proposal-review-from-agreements-view.tsx" \
  "src/app/[orgSlug]/study/[studyId]/review/proposal-review-from-agreements-view.test.tsx"
```

- [ ] **Step 7: Typecheck — no remaining `from:` on reviewer routes**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If any reviewer view still passes `from` to `Routes.studyReview`, remove that arg (its `?from=` job is gone).

- [ ] **Step 8: Verify the legacy cascade + all reviewer `?from=` cases are gone**

Run: `grep -rn "ProposalReviewFromAgreementsView\|from === 'code-review'\|from === 'agreements'\|from === 'initial-request'\|from === 'previous'\|agreements-proceed" "src/app/[orgSlug]/study/[studyId]/review/" "src/app/[orgSlug]/study/[studyId]/agreements/"`
Expected: no matches in the reviewer paths (all five `?from=` cases removed: `initial-request`, `code-review`, `agreements`, `agreements-proceed`, and the reviewer `previous`). The researcher `agreements` branch no longer reads `from` either.

---

## Task 11: Rewrite the reviewer page test for state-machine dispatch

**Files:**

- Modify: `src/app/[orgSlug]/study/[studyId]/review/page.test.tsx`

The existing ~37KB test asserts the old `?from=` cascade. Rewrite it to assert, per representative DB state, which screen renders — no mocking of our components/actions; seed the DB via the existing unit helpers and assert on the rendered output's distinguishing content.

- [ ] **Step 1: Inventory the existing test's helpers and reuse them**

Run: `sed -n '1,60p' "src/app/[orgSlug]/study/[studyId]/review/page.test.tsx"`
Expected: identifies the seeding helpers (study/job/status insertion, reviewer session mock) and the render/assert utilities already in use. Reuse them — do not introduce new mocking patterns.

- [ ] **Step 2: Write per-state screen assertions**

Replace the `?from=`-driven cases with one test per reviewer state → expected screen. Assert on a distinguishing marker each screen renders (e.g. the proposal-review editor, the code-review heading "Review study code", the post-feedback banner, the results layout). One representative per rule:

```tsx
// Pseudocode shape — adapt to the file's existing seed/render helpers:
//
// it('PENDING-REVIEW renders the editable proposal review', async () => {
//     const { study } = await seedSubmittedStudy({ status: 'PENDING-REVIEW' })
//     renderReviewPage({ study })  // existing helper
//     expect(await screen.findByText(/Initial request review/i)).toBeDefined()
// })
//
// it('code submitted + agreements acked renders code review', async () => {
//     const { study } = await seedStudyWithSubmittedCode({ reviewerAgreementsAcked: true })
//     renderReviewPage({ study })
//     expect(await screen.findByText(/Review study code/i)).toBeDefined()
// })
//
// it('code decided renders the code post-feedback view', async () => { ... })
// it('results present renders the results-only study details', async () => { ... })
// it('code submitted + agreements NOT acked renders the agreements gate', async () => { ... })
```

Use the **real** distinguishing strings from each view component (grep them out of the view files — e.g. `grep -n "Review study code\|Initial request review" review/*.tsx`). Do not assert on text you haven't confirmed exists.

- [ ] **Step 3: Run the reviewer page test**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/review/page.test.tsx"`
Expected: PASS — every representative state resolves to the expected screen.

- [ ] **Step 4: Run any tests for views whose previousHref changed**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/review/study-details-reviewer.test.tsx" "src/app/[orgSlug]/study/[studyId]/review/study-details-reviewer-view"`
Expected: PASS — if a test asserted the old `from=code-review` href, update it to the bare review route.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/review/" "src/lib/routes/definitions.ts"
git commit -m "feat(study-view): /review is pure reviewer state-machine dispatch, no ?from="
```

---

## Task 12: Full validation sweep

**Files:** none (verification only)

- [ ] **Step 1: Lint-fix**

Run: `pnpm run lint:fix`
Expected: no remaining lint errors (formatting auto-applied).

- [ ] **Step 2: Unit tests**

Run: `pnpm run test:unit`
Expected: all pass. The PR's baseline was 1602 passing / 0 failing; expect that plus the new reviewer tests, still 0 failing. If any test fails — including a pre-existing one — fix it (CLAUDE.md: do not skip pre-existing failures).

- [ ] **Step 3: Checks (types + lint + action validation)**

Run: `pnpm run checks`
Expected: passing.

- [ ] **Step 4: Confirm reviewer `?from=` is fully gone**

Run: `grep -rn "studyReview(.*from\|from === '" "src/app/[orgSlug]/study/[studyId]/review/" "src/components"`
Expected: no reviewer `?from=` usage remains.

- [ ] **Step 5: Commit any lint/test fixups**

```bash
git add -A
git commit -m "chore: lint + test fixups for reviewer state machine"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Projection unchanged (Task 0/none, by design) ✓; six screens + registry (Tasks 1,6,7) ✓; `REVIEWER_SCREEN_RULES` (Tasks 2–4) ✓; `renderStudyScreen` + `/view` refactor (Task 8) ✓; `?from=` removal + dedicated proposal route + gated `definitions.ts` (Tasks 9–10) ✓; dead-view removal (Task 10) ✓; consistency invariant + page tests (Tasks 5, 11) ✓; validation gates (Task 12) ✓.
- **Two known smells flagged inline, not hidden:** (a) the `reviewer-agreements` screen depends on reusing the existing agreements view — Task 6 Step 6 says STOP and surface if it can't be reused cleanly; (b) the dedicated proposal route's `raw` argument — Task 10 Step 2 says fetch the real bundle rather than cast if the adapter reads `raw`.
- **Gated step:** Task 9 (`definitions.ts`) requires explicit user approval — do not proceed past the STOP without it.

```

```
