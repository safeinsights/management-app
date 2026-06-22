# Study Screen State Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four scattered, order-dependent study-routing decision sites (`use-study-href`, `view/page.tsx`, `review/page.tsx`, `use-study-status`) with one pure, auditable state machine that projects raw DB rows into a flat `StudyState` and resolves screen / dashboard-link / pill / highlight from declarative ordered rule tables.

**Architecture:** A new pure module `src/lib/study-screen/` (no React/DB/Next imports) holds `projectStudyState(raw)` — the single place that interprets job/status ordering via latest-job-by-`max(id)` + set-existence — plus ordered rule tables and resolvers. Consumers fetch raw state and call the resolvers. We migrate consumers one at a time (strangler-fig), deleting the old order-dependent helpers only when their last caller is gone.

**Tech Stack:** TypeScript, Next.js App Router (RSC), Kysely, Mantine, vitest. Spec: `docs/plans/2026-06-22-study-screen-state-machine-design.md`.

**Scope of THIS plan (per spec §2 / Scope Check):**

- Pure module: types, `projectStudyState`, `SCREEN_RULES` + `resolveScreen`, `DASHBOARD_RULES` + `resolveDashboardAction`, `resolvePillStatus` + `resolveRowHighlight`. **Researcher role only**; reviewer rules stubbed.
- Cut over the **dashboard** (link via `resolveDashboardAction`, pill via `resolvePillStatus`, highlight via `resolveRowHighlight`), retiring `use-study-href.ts` and `useStudyStatus`'s selection logic.
- Cut over the **researcher `/view` page** to fetch a full `RawStudyState` and render via `resolveScreen` + a `SCREEN_COMPONENTS` registry, adapting existing view components.
- Delete `latestSubmittedJobHasLiveCodeDecision`, `latestSubmittedJobLiveCodeDecisionStatus`, `latestCodeChangeIsSubmission` once their last callers are gone.

**Explicitly DEFERRED to follow-up plans (out of scope here):**

- Reviewer `/review` page cutover (spec §13; reviewer rule table is stubbed). It keeps working unchanged in this plan because we do **not** delete the helpers it still uses until Task 14 verifies zero callers — see Task 14's guard.
- Route-segment restructuring for multi-step flows (`?from=` removal beyond what the researcher view needs, new `step` path segments). Spec §8/§12 mark route changes as needing explicit approval to `definitions.ts`. This plan keeps existing routes and only removes `?from=` reads that the researcher-view rewrite makes dead.

**Resolved during planning (was spec §12 open Q1):** `hasSavedEdits` does NOT need a comment join. The `study` table already has `proposalResubmissionNoteDraft` and `codeResubmissionNoteDraft` columns (`database/types.ts:219,237`), already selected by `fetchStudyQuery` (`study.actions.ts:110-111`). So `hasSavedEdits = !!raw.proposalResubmissionNoteDraft` and a code variant `hasSavedCodeEdits = !!raw.codeResubmissionNoteDraft`.

---

## File Structure

**New — pure module `src/lib/study-screen/`** (no React/DB/Next):

- `state.types.ts` — `RawStudyState`, `RawJob`, `StudyState`, `DashboardState`, `StudyRole`.
- `state.ts` — `projectStudyState(raw): StudyState`.
- `screens.ts` — `ScreenId`, `ScreenIntent`, `ButtonDescriptor`, `ModalDescriptor`, `ScreenDescriptor`, `DashboardAction`.
- `screen-rules.ts` — `SCREEN_RULES` (Tier 2, researcher).
- `dashboard-rules.ts` — `DASHBOARD_RULES` (Tier 1, researcher).
- `pill.ts` — `resolvePillStatus`, `resolveRowHighlight`, `DISPLAY_STATUS_PRIORITY`.
- `resolve.ts` — `resolveScreen`, `resolveDashboardAction`.
- `index.ts` — public re-exports.
- `*.test.ts` — co-located.

**New — rendering layer `src/app/[orgSlug]/study/[studyId]/_screens/`** (React):

- `types.ts` — `ScreenComponentProps`.
- `registry.ts` — `SCREEN_COMPONENTS` (`Partial<Record<ScreenId, ScreenComponent>>` in this plan; tightened to a full `Record` once every screen is wired in the follow-up).
- `study-nav-buttons.tsx` — renders `descriptor.back`/`forward` (route → `<Link>`, intent → button via `onIntent`).
- `study-screen-renderer.tsx` — `<StudyScreenRenderer>` (server): looks up component, falls back to legacy output.
- `proposal-feedback-screen.tsx` — first wired screen (Task 15).
- `intents.ts` — `ScreenIntent → confirm-modal/action` map. **DEFERRED** (created in the follow-up plan that wires intent-emitting screens; no task here creates it).

**New — query & mappers:**

- `src/server/db/study-state-query.ts` — `rawStudyStateForStudy(studyId): RawStudyState` (all jobs + statuses + files in one round-trip).
- `src/components/dashboard/studies-table/dashboard-raw-state.ts` — `dashboardRawStateFromRow(row): RawStudyState` (synthesizes a single-latest-job raw state from the dashboard row).

**Modified:**

- `src/components/dashboard/studies-table/study-action-link.tsx` — render `resolveDashboardAction`.
- `src/components/dashboard/studies-table/study-row.tsx` — highlight via `resolveRowHighlight`.
- `src/hooks/use-study-status.ts` — becomes a thin wrapper over `projectStudyState` + `resolvePillStatus`.
- `src/app/[orgSlug]/study/[studyId]/view/page.tsx` — fetch raw → resolve → render registry.
- Researcher view components — adapted to `ScreenComponentProps`.

**Deleted (final task):**

- `src/hooks/use-study-href.ts`.
- `latestSubmittedJobHasLiveCodeDecision`, `latestSubmittedJobLiveCodeDecisionStatus`, `latestCodeChangeIsSubmission` from `src/lib/study-job-status.ts` (only after Task 14 confirms zero callers).

---

## Phase 1 — Pure types & projection (zero production impact)

### Task 1: State & output types

**Files:**

- Create: `src/lib/study-screen/state.types.ts`
- Create: `src/lib/study-screen/screens.ts`

- [ ] **Step 1: Create `state.types.ts`**

```ts
import type { Language, StudyJobFileType, StudyJobStatus, StudyStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type StudyRole = 'researcher' | 'reviewer'

// Raw rows as fetched. statusChanges/jobs order is NOT significant — the projection
// selects the latest job by max(id) and treats each job's statuses as a set.
export type RawJob = {
    id: string
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>
    files: ReadonlyArray<{ fileType: StudyJobFileType }>
}

export type RawStudyState = {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
    researcherAgreementsAckedAt: Date | null
    reviewerAgreementsAckedAt: Date | null
    language: Language | null
    proposalResubmissionNoteDraft: string | null
    codeResubmissionNoteDraft: string | null
    jobs: ReadonlyArray<RawJob>
}

// Flat, already-disambiguated facts. Every field is a plain boolean/enum/number.
// Job-phase facts describe the LATEST job only (max id); submissionRound is the one cross-job count.
export type StudyState = {
    status: StudyStatus
    isDraft: boolean
    researcherAgreementsAcked: boolean
    reviewerAgreementsAcked: boolean
    hasAnyJob: boolean
    hasSubmittedCode: boolean
    codeDecision: CodeDecisionStatus | null
    codeAwaitingDecision: boolean
    isExecuting: boolean
    hasResults: boolean
    resultsApproved: boolean
    resultsRejected: boolean
    resultsErrored: boolean
    resultsDisplayStatus: 'RUN-COMPLETE' | 'FILES-APPROVED' | 'FILES-REJECTED' | 'JOB-ERRORED' | null
    submissionRound: number
    hasSavedEdits: boolean
    hasSavedCodeEdits: boolean
    displayStatus: AllStatus
}

// Dashboard tier may read everything EXCEPT the two facts its query doesn't fetch.
export type DashboardState = Omit<StudyState, 'submissionRound' | 'hasSavedEdits' | 'hasSavedCodeEdits'>
```

- [ ] **Step 2: Create `screens.ts`**

```ts
import type { Route } from 'next'

export type ScreenId =
    | 'proposal-edit'
    | 'proposal-submitted'
    | 'proposal-feedback'
    | 'agreements'
    | 'code-upload'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'code-edit'
    | 'study-results'
    | 'study-overview'

export type ScreenIntent = 'submit-proposal' | 'resubmit-proposal' | 'submit-code' | 'resubmit-code'

export type ButtonDescriptor = {
    title: string
    target: { kind: 'route'; href: Route } | { kind: 'intent'; intent: ScreenIntent }
}

export type ModalDescriptor = { intent: ScreenIntent }

export type ScreenDescriptor = {
    screen: ScreenId
    step?: string
    back?: ButtonDescriptor
    forward?: ButtonDescriptor
    modal?: ModalDescriptor
}

export type DashboardAction = {
    label: string
    href: Route
    secondaryAction?: 'delete-draft'
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors). If `CodeDecisionStatus` import path is wrong, it is exported from `src/lib/study-job-status.ts:42`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/study-screen/state.types.ts src/lib/study-screen/screens.ts
git commit -m "feat(study-screen): add state and screen descriptor types"
```

---

### Task 2: `projectStudyState` — latest-job selection + set-existence

**Files:**

- Create: `src/lib/study-screen/state.ts`
- Test: `src/lib/study-screen/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { RawStudyState, RawJob } from './state.types'
import { projectStudyState } from './state'

const job = (id: string, statuses: string[], files: string[] = []): RawJob => ({
    id,
    statusChanges: statuses.map((status) => ({ status: status as RawJob['statusChanges'][number]['status'] })),
    files: files.map((fileType) => ({ fileType: fileType as RawJob['files'][number]['fileType'] })),
})

const raw = (overrides: Partial<RawStudyState> = {}): RawStudyState => ({
    status: 'DRAFT',
    approvedAt: null,
    rejectedAt: null,
    researcherAgreementsAckedAt: null,
    reviewerAgreementsAckedAt: null,
    language: 'R',
    proposalResubmissionNoteDraft: null,
    codeResubmissionNoteDraft: null,
    jobs: [],
    ...overrides,
})

// v7 ids are insertion-ordered; use lexically-increasing ids so max(id) === latest round.
const ID1 = '019000000000-0000-0000-0000-000000000001'
const ID2 = '019000000000-0000-0000-0000-000000000002'

describe('projectStudyState', () => {
    it('empty study (no jobs) → all job/results facts false, draft true', () => {
        const s = projectStudyState(raw({ status: 'DRAFT' }))
        expect(s.hasAnyJob).toBe(false)
        expect(s.hasSubmittedCode).toBe(false)
        expect(s.codeDecision).toBeNull()
        expect(s.codeAwaitingDecision).toBe(false)
        expect(s.hasResults).toBe(false)
        expect(s.isDraft).toBe(true)
        expect(s.submissionRound).toBe(0)
        expect(s.displayStatus).toBe('DRAFT')
    })

    it('CODE-APPROVED stays approved even with a later CODE-SCANNED on the same job', () => {
        const s = projectStudyState(
            raw({ status: 'APPROVED', jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED'])] }),
        )
        expect(s.codeDecision).toBe('CODE-APPROVED')
        expect(s.codeAwaitingDecision).toBe(false)
    })

    it('resubmission: older approved job + newer submitted-only job → awaiting on latest, not masked', () => {
        const older = job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])
        const newer = job(ID2, ['CODE-SUBMITTED'])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [older, newer] }))
        expect(s.codeDecision).toBeNull()
        expect(s.codeAwaitingDecision).toBe(true)
        expect(s.submissionRound).toBe(2)
    })

    it('agreements acked booleans map from the two columns', () => {
        const s = projectStudyState(raw({ researcherAgreementsAckedAt: new Date(), reviewerAgreementsAckedAt: null }))
        expect(s.researcherAgreementsAcked).toBe(true)
        expect(s.reviewerAgreementsAcked).toBe(false)
    })

    it('hasSavedEdits / hasSavedCodeEdits read the draft-note columns', () => {
        const s = projectStudyState(raw({ proposalResubmissionNoteDraft: 'wip', codeResubmissionNoteDraft: null }))
        expect(s.hasSavedEdits).toBe(true)
        expect(s.hasSavedCodeEdits).toBe(false)
    })

    it('results present → hasResults and the right boolean, latest job only', () => {
        const s = projectStudyState(
            raw({ status: 'APPROVED', jobs: [job(ID2, ['CODE-SUBMITTED', 'CODE-APPROVED', 'FILES-APPROVED'])] }),
        )
        expect(s.hasResults).toBe(true)
        expect(s.resultsApproved).toBe(true)
        expect(s.resultsDisplayStatus).toBe('FILES-APPROVED')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/study-screen/state.test.ts`
Expected: FAIL with "projectStudyState is not a function" (or module not found).

- [ ] **Step 3: Implement `state.ts`**

```ts
import type { StudyJobStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'
import {
    CODE_DECISION_JOB_STATUSES,
    STUDY_CODE_RUNNING_JOB_STATUSES,
    STUDY_RESULTS_JOB_STATUSES,
} from '@/lib/study-job-status'
import type { RawJob, RawStudyState, StudyState } from './state.types'

const has = (job: RawJob | undefined, statuses: readonly StudyJobStatus[]): boolean =>
    !!job && job.statusChanges.some((c) => statuses.includes(c.status))

// Fixed priority for the single results value (display only). NOT array order.
const RESULTS_PRIORITY: StudyState['resultsDisplayStatus'][] = [
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
    'RUN-COMPLETE',
]

// Code decision priority: APPROVED is permanent and wins if several ever coexist on the job.
const CODE_DECISION_PRIORITY: CodeDecisionStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED']

// Pill display-status priority (highest-priority PRESENT status on the latest job wins).
// Mirrors useStudyStatus's intent; finer-grained than the screen booleans (keeps exec sub-statuses).
const DISPLAY_STATUS_PRIORITY: StudyJobStatus[] = [
    'JOB-ERRORED',
    'FILES-REJECTED',
    'FILES-APPROVED',
    'RUN-COMPLETE',
    'JOB-RUNNING',
    'JOB-READY',
    'JOB-PACKAGING',
    'JOB-PROVISIONING',
    'CODE-REJECTED',
    'CODE-CHANGES-REQUESTED',
    'CODE-APPROVED',
    'CODE-SCANNED',
    'CODE-SUBMITTED',
    'INITIATED',
]

function latestJob(jobs: ReadonlyArray<RawJob>): RawJob | undefined {
    if (jobs.length === 0) return undefined
    // max(id): v7 ids are insertion-ordered, so lexical max === most recently created round.
    return jobs.reduce((a, b) => (b.id > a.id ? b : a))
}

export function projectStudyState(raw: RawStudyState): StudyState {
    const job = latestJob(raw.jobs)
    const jobStatuses = new Set<StudyJobStatus>(job?.statusChanges.map((c) => c.status) ?? [])

    const codeDecision = CODE_DECISION_PRIORITY.find((d) => jobStatuses.has(d)) ?? null
    const hasSubmittedCode = jobStatuses.has('CODE-SUBMITTED')
    const codeAwaitingDecision = hasSubmittedCode && codeDecision === null
    const hasResults = has(job, STUDY_RESULTS_JOB_STATUSES)
    const resultsDisplayStatus = RESULTS_PRIORITY.find((r) => r && jobStatuses.has(r)) ?? null

    // displayStatus: drop stale code decisions on a resubmission (latest job submitted, no live decision),
    // then pick the highest-priority present status; fall back to study status when the job has none.
    const dropStale = hasSubmittedCode && codeDecision === null
    const visible = DISPLAY_STATUS_PRIORITY.filter(
        (st) => jobStatuses.has(st) && !(dropStale && CODE_DECISION_JOB_STATUSES.includes(st as CodeDecisionStatus)),
    )
    const displayStatus: AllStatus = visible[0] ?? raw.status

    const submissionRound = raw.jobs.filter((j) => j.statusChanges.some((c) => c.status === 'CODE-SUBMITTED')).length

    return {
        status: raw.status,
        isDraft: raw.status === 'DRAFT',
        researcherAgreementsAcked: !!raw.researcherAgreementsAckedAt,
        reviewerAgreementsAcked: !!raw.reviewerAgreementsAckedAt,
        hasAnyJob: raw.jobs.length > 0,
        hasSubmittedCode,
        codeDecision,
        codeAwaitingDecision,
        isExecuting: has(job, STUDY_CODE_RUNNING_JOB_STATUSES),
        hasResults,
        resultsApproved: jobStatuses.has('FILES-APPROVED'),
        resultsRejected: jobStatuses.has('FILES-REJECTED'),
        resultsErrored: jobStatuses.has('JOB-ERRORED'),
        resultsDisplayStatus,
        submissionRound,
        hasSavedEdits: !!raw.proposalResubmissionNoteDraft,
        hasSavedCodeEdits: !!raw.codeResubmissionNoteDraft,
        displayStatus,
    }
}

export { DISPLAY_STATUS_PRIORITY }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/study-screen/state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/study-screen/state.ts src/lib/study-screen/state.test.ts
git commit -m "feat(study-screen): projectStudyState via latest-job + set-existence"
```

---

### Task 3: Order-independence (shuffle) test — the headline guard

**Files:**

- Test: `src/lib/study-screen/state.shuffle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { RawJob, RawStudyState } from './state.types'
import { projectStudyState } from './state'

// Deterministic permutations (no Math.random — unavailable and would break reproducibility).
function permutations<T>(arr: readonly T[]): T[][] {
    if (arr.length <= 1) return [arr.slice()]
    const out: T[][] = []
    arr.forEach((x, i) => {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
        for (const p of permutations(rest)) out.push([x, ...p])
    })
    return out
}

const job = (id: string, statuses: string[]): RawJob => ({
    id,
    statusChanges: statuses.map((status) => ({ status: status as RawJob['statusChanges'][number]['status'] })),
    files: [],
})

const base = (jobs: RawJob[]): RawStudyState => ({
    status: 'APPROVED',
    approvedAt: null,
    rejectedAt: null,
    researcherAgreementsAckedAt: null,
    reviewerAgreementsAckedAt: null,
    language: 'R',
    proposalResubmissionNoteDraft: null,
    codeResubmissionNoteDraft: null,
    jobs,
})

const ID1 = '019000000000-0000-0000-0000-000000000001'
const ID2 = '019000000000-0000-0000-0000-000000000002'

describe('projectStudyState order-independence', () => {
    const fixtures: Record<string, RawJob[]> = {
        lateScanAfterApproval: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED'])],
        resultsAlongsideSibling: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'FILES-APPROVED', 'CODE-SCANNED'])],
        resubmissionTwoRounds: [job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']), job(ID2, ['CODE-SUBMITTED'])],
    }

    for (const [name, jobs] of Object.entries(fixtures)) {
        it(`${name}: identical under status+job permutation`, () => {
            const expected = projectStudyState(base(jobs))
            // Permute each job's statusChanges AND the jobs array; every combination must match.
            const jobStatusPerms = jobs.map((j) => permutations(j.statusChanges))
            for (const jobOrder of permutations(jobs.map((_, i) => i))) {
                for (const pick of cartesian(jobStatusPerms)) {
                    const shuffled = jobOrder.map((ji) => ({ ...jobs[ji], statusChanges: pick[ji] }))
                    expect(projectStudyState(base(shuffled))).toEqual(expected)
                }
            }
        })
    }
})

function cartesian<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>((acc, cur) => acc.flatMap((a) => cur.map((c) => [...a, c])), [[]])
}
```

- [ ] **Step 2: Run test to verify it passes (projection is already order-independent)**

Run: `pnpm exec vitest run src/lib/study-screen/state.shuffle.test.ts`
Expected: PASS (3 tests). If any FAILS, a fact in `state.ts` is reading order (e.g. `statusChanges[0]`) — fix `state.ts`, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/study-screen/state.shuffle.test.ts
git commit -m "test(study-screen): order-independence shuffle guard for projection"
```

---

## Phase 2 — Resolvers & rule tables (pure)

### Task 4: `resolveScreen` + `SCREEN_RULES` (researcher)

**Files:**

- Create: `src/lib/study-screen/screen-rules.ts`
- Create: `src/lib/study-screen/resolve.ts`
- Test: `src/lib/study-screen/resolve.test.ts`

> Button `title` strings and hrefs below are the researcher values transcribed from the product
> spec doc (`docs` source "Front-End Logic Log"): e.g. "Previous Step", "Proceed to Step 3",
> "Edit and resubmit", "Go to dashboard". Hrefs use `Routes.*` builders. Where a row's
> back/forward is blank in the product doc (results rows), omit that button.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen } from './resolve'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
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
    displayStatus: 'DRAFT',
    ...overrides,
})

const ctx = { orgSlug: 'lab', studyId: '019000000000-0000-0000-0000-000000000001' }

describe('resolveScreen (researcher)', () => {
    it('results present → study-results (highest precedence)', () => {
        expect(
            resolveScreen('researcher', state({ hasResults: true, codeDecision: 'CODE-APPROVED' }), undefined, ctx)
                .screen,
        ).toBe('study-results')
    })
    it('approved decision → code-approved', () => {
        expect(resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED' }), undefined, ctx).screen).toBe(
            'code-approved',
        )
    })
    it('executing window → code-approved', () => {
        expect(resolveScreen('researcher', state({ isExecuting: true }), undefined, ctx).screen).toBe('code-approved')
    })
    it('changes requested → code-feedback with Edit and resubmit forward', () => {
        const d = resolveScreen('researcher', state({ codeDecision: 'CODE-CHANGES-REQUESTED' }), undefined, ctx)
        expect(d.screen).toBe('code-feedback')
        expect(d.forward?.title).toBe('Edit and resubmit')
    })
    it('awaiting decision → code-under-review', () => {
        expect(
            resolveScreen('researcher', state({ codeAwaitingDecision: true, hasSubmittedCode: true }), undefined, ctx)
                .screen,
        ).toBe('code-under-review')
    })
    it('approved proposal, no code, agreements not acked → agreements', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: false }),
                undefined,
                ctx,
            ).screen,
        ).toBe('agreements')
    })
    it('approved proposal, no code, agreements acked → code-upload', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: true }),
                undefined,
                ctx,
            ).screen,
        ).toBe('code-upload')
    })
    it('pending review → proposal-submitted', () => {
        expect(
            resolveScreen('researcher', state({ status: 'PENDING-REVIEW', isDraft: false }), undefined, ctx).screen,
        ).toBe('proposal-submitted')
    })
    it('draft → proposal-edit', () => {
        expect(resolveScreen('researcher', state({ status: 'DRAFT', isDraft: true }), undefined, ctx).screen).toBe(
            'proposal-edit',
        )
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/study-screen/resolve.test.ts`
Expected: FAIL ("resolveScreen is not a function").

- [ ] **Step 3: Implement `screen-rules.ts`**

```ts
import { Routes } from '@/lib/routes'
import type { StudyState } from './state.types'
import type { ScreenDescriptor } from './screens'

export type ScreenRuleCtx = { orgSlug: string; studyId: string }
export type ScreenRule = {
    when: (s: StudyState) => boolean
    screen: (s: StudyState, ctx: ScreenRuleCtx) => ScreenDescriptor
}

const dashboard = (): ScreenDescriptor['forward'] => ({
    title: 'Go to dashboard',
    target: { kind: 'route', href: Routes.dashboard },
})

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins.
export const SCREEN_RULES: ScreenRule[] = [
    { when: (s) => s.hasResults, screen: () => ({ screen: 'study-results' }) },

    {
        when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting,
        screen: () => ({ screen: 'code-approved', forward: dashboard() }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED',
        screen: (_s, ctx) => ({
            screen: 'code-feedback',
            forward: { title: 'Edit and resubmit', target: { kind: 'route', href: Routes.studyResubmit(ctx) } },
        }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-REJECTED',
        screen: () => ({ screen: 'code-feedback', forward: dashboard() }),
    },

    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'code-under-review', forward: dashboard() }) },

    {
        when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode,
        screen: (s, ctx) =>
            s.researcherAgreementsAcked
                ? {
                      screen: 'code-upload',
                      back: { title: 'Previous Step', target: { kind: 'route', href: Routes.studyAgreements(ctx) } },
                  }
                : {
                      screen: 'agreements',
                      forward: { title: 'Proceed to Step 4', target: { kind: 'route', href: Routes.studyCode(ctx) } },
                  },
    },

    {
        when: (s) => s.status === 'PENDING-REVIEW',
        screen: () => ({ screen: 'proposal-submitted', forward: dashboard() }),
    },
    {
        when: (s) => s.status === 'CHANGE-REQUESTED',
        screen: (_s, ctx) => ({
            screen: 'proposal-feedback',
            forward: { title: 'Edit and resubmit', target: { kind: 'route', href: Routes.studyEditAndResubmit(ctx) } },
        }),
    },
    {
        when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED',
        screen: () => ({ screen: 'proposal-feedback', back: dashboard() }),
    },

    {
        when: (s) => s.isDraft,
        screen: (_s, ctx) => ({
            screen: 'proposal-edit',
            step: 'data-org',
            forward: { title: 'Proceed to step 2', target: { kind: 'route', href: Routes.studyProposal(ctx) } },
        }),
    },

    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
```

- [ ] **Step 4: Implement `resolve.ts` (resolveScreen only for now)**

```ts
import type { StudyRole, StudyState } from './state.types'
import type { ScreenDescriptor } from './screens'
import { SCREEN_RULES, type ScreenRuleCtx } from './screen-rules'

export function resolveScreen(
    role: StudyRole,
    state: StudyState,
    step: string | undefined,
    ctx: ScreenRuleCtx,
): ScreenDescriptor {
    // Reviewer rules are not yet implemented (spec §13). Until then, reviewer falls through to
    // the researcher table's fallback so callers never crash; the reviewer page is NOT migrated
    // in this plan and does not call resolveScreen.
    const rules = SCREEN_RULES
    const rule = rules.find((r) => r.when(state))! // total: the last rule is `when: () => true`
    const descriptor = rule.screen(state, ctx)
    // Per spec §9, an explicit URL `step` overrides the descriptor's default step. Validating a
    // step against the screen's allowed steps (falling back to the first) belongs with the
    // multi-step screen work, which is DEFERRED (Task 15 follow-up). No screen consumes `step` in
    // this plan, so a passthrough is correct and sufficient here.
    return step ? { ...descriptor, step } : descriptor
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/study-screen/resolve.test.ts`
Expected: PASS (9 tests). If `Routes.studyResubmit` etc. don't exist, check `src/lib/routes/definitions.ts` — `studyResubmit`, `studyEditAndResubmit`, `studyAgreements`, `studyCode`, `studyProposal` are all defined there.

- [ ] **Step 6: Commit**

```bash
git add src/lib/study-screen/screen-rules.ts src/lib/study-screen/resolve.ts src/lib/study-screen/resolve.test.ts
git commit -m "feat(study-screen): resolveScreen + researcher SCREEN_RULES"
```

---

### Task 5: `resolveDashboardAction` + `DASHBOARD_RULES`

**Files:**

- Create: `src/lib/study-screen/dashboard-rules.ts`
- Modify: `src/lib/study-screen/resolve.ts`
- Test: `src/lib/study-screen/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { DashboardState } from './state.types'
import { resolveDashboardAction } from './resolve'

const dstate = (overrides: Partial<DashboardState>): DashboardState => ({
    status: 'DRAFT',
    isDraft: true,
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
    displayStatus: 'DRAFT',
    ...overrides,
})

const ctx = { orgSlug: 'lab', studyId: '019000000000-0000-0000-0000-000000000001' }

describe('resolveDashboardAction (researcher)', () => {
    it('draft → Edit + delete-draft', () => {
        const a = resolveDashboardAction('researcher', dstate({ isDraft: true }), ctx)
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBe('delete-draft')
        expect(a.href).toContain('/edit')
    })
    it('approved, has job, no code → Continue upload', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: true, hasSubmittedCode: false }),
            ctx,
        )
        expect(a.label).toBe('Continue upload')
        expect(a.href).toContain('/code')
    })
    it('everything else → View', () => {
        const a = resolveDashboardAction('researcher', dstate({ status: 'PENDING-REVIEW', isDraft: false }), ctx)
        expect(a.label).toBe('View')
        expect(a.href).toContain('/view')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/study-screen/dashboard.test.ts`
Expected: FAIL ("resolveDashboardAction is not a function").

- [ ] **Step 3: Implement `dashboard-rules.ts`**

```ts
import { Routes } from '@/lib/routes'
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'

export type DashboardRuleCtx = { orgSlug: string; studyId: string }
export type DashboardRule = {
    when: (s: DashboardState) => boolean
    action: (ctx: DashboardRuleCtx) => DashboardAction
}

export const DASHBOARD_RULES: DashboardRule[] = [
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

- [ ] **Step 4: Add `resolveDashboardAction` to `resolve.ts`**

Add these imports and function to `src/lib/study-screen/resolve.ts`:

```ts
import type { DashboardState } from './state.types'
import type { DashboardAction } from './screens'
import { DASHBOARD_RULES, type DashboardRuleCtx } from './dashboard-rules'

export function resolveDashboardAction(role: StudyRole, state: DashboardState, ctx: DashboardRuleCtx): DashboardAction {
    // researcher-only for now; reviewer dashboard link is unchanged in this plan.
    const rule = DASHBOARD_RULES.find((r) => r.when(state))!
    return rule.action(ctx)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/study-screen/dashboard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/study-screen/dashboard-rules.ts src/lib/study-screen/resolve.ts src/lib/study-screen/dashboard.test.ts
git commit -m "feat(study-screen): resolveDashboardAction + DASHBOARD_RULES"
```

---

### Task 6: `resolvePillStatus` + `resolveRowHighlight`

**Files:**

- Create: `src/lib/study-screen/pill.ts`
- Test: `src/lib/study-screen/pill.test.ts`

> Spec §7 / §11: port the existing `useStudyStatus` behaviors. The pill copy lives in
> `status-labels.ts` (`RESEARCHER_STATUS_LABELS` / `REVIEWER_STATUS_LABELS`, keyed by `AllStatus`).
> `resolvePillStatus` maps `state.displayStatus` to a label, applying the researcher
> JOB-ERRORED-hiding rule. Highlight predicates per spec §7.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolvePillStatus, resolveRowHighlight } from './pill'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'APPROVED',
    isDraft: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: true,
    hasSubmittedCode: true,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 1,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'CODE-SUBMITTED',
    ...overrides,
})

describe('resolvePillStatus', () => {
    it('researcher does NOT see Errored until a reviewer files a decision', () => {
        // displayStatus would be JOB-ERRORED, but researcher hides it (no FILES-* present)
        const label = resolvePillStatus('researcher', state({ displayStatus: 'JOB-ERRORED', resultsErrored: true }))
        expect(label.label).not.toBe('Errored')
    })
    it('reviewer sees Errored immediately', () => {
        const label = resolvePillStatus('reviewer', state({ displayStatus: 'JOB-ERRORED', resultsErrored: true }))
        expect(label.label).toBe('Errored')
    })
    it('execution sub-status keeps its distinct label (Packaging)', () => {
        const label = resolvePillStatus('researcher', state({ displayStatus: 'JOB-PACKAGING', isExecuting: true }))
        expect(label.label).toBe('Packaging')
    })
})

describe('resolveRowHighlight', () => {
    it('reviewer: pending review highlights', () => {
        expect(resolveRowHighlight('reviewer', state({ status: 'PENDING-REVIEW' }))).toBe(true)
    })
    it('reviewer: code awaiting decision highlights', () => {
        expect(resolveRowHighlight('reviewer', state({ codeAwaitingDecision: true }))).toBe(true)
    })
    it('researcher: results approved highlights', () => {
        expect(resolveRowHighlight('researcher', state({ resultsApproved: true }))).toBe(true)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/study-screen/pill.test.ts`
Expected: FAIL ("resolvePillStatus is not a function").

- [ ] **Step 3: Implement `pill.ts`**

```ts
import type { AllStatus } from '@/lib/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'
import type { StudyRole, StudyState } from './state.types'

const LABELS: Record<StudyRole, Partial<Record<AllStatus, StatusLabel>>> = {
    researcher: RESEARCHER_STATUS_LABELS,
    reviewer: REVIEWER_STATUS_LABELS,
}

// Researchers must not see "Errored" until a reviewer records FILES-APPROVED/FILES-REJECTED.
// Until then the pill falls back to the prior code stage (typically CODE-APPROVED).
function effectiveDisplayStatus(role: StudyRole, state: StudyState): AllStatus {
    if (role === 'researcher' && state.resultsErrored && !state.resultsApproved && !state.resultsRejected) {
        // hide JOB-ERRORED: prefer the live code decision, else the study status
        return state.codeDecision ?? state.status
    }
    return state.displayStatus
}

export function resolvePillStatus(role: StudyRole, state: StudyState): StatusLabel {
    const key = effectiveDisplayStatus(role, state)
    const labels = LABELS[role]
    return labels[key] ?? labels['DRAFT'] ?? labels[state.status]!
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/study-screen/pill.test.ts`
Expected: PASS (6 tests). If `StatusLabel`'s shape differs (e.g. `.label` missing), inspect `src/lib/status-labels.ts` — `StatusLabel = { stage, label, tooltip?, colors }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/study-screen/pill.ts src/lib/study-screen/pill.test.ts
git commit -m "feat(study-screen): resolvePillStatus + resolveRowHighlight"
```

---

### Task 7: Tier-1 ↔ Tier-2 consistency invariant test + public index

**Files:**

- Create: `src/lib/study-screen/index.ts`
- Test: `src/lib/study-screen/consistency.test.ts`

- [ ] **Step 1: Create `index.ts`**

```ts
export * from './state.types'
export * from './screens'
export { projectStudyState } from './state'
export { resolveScreen, resolveDashboardAction } from './resolve'
export { resolvePillStatus, resolveRowHighlight } from './pill'
```

- [ ] **Step 2: Write the invariant test**

```ts
import { describe, expect, it } from 'vitest'
import type { DashboardState, StudyState } from './state.types'
import { resolveDashboardAction, resolveScreen } from './resolve'

// Every href Tier-1 can emit must resolve to a NON-fallback screen for the same state.
// study-overview is the fallback; reaching it from a Tier-1 link means the tiers disagree.
const ctx = { orgSlug: 'lab', studyId: '019000000000-0000-0000-0000-000000000001' }

const full = (overrides: Partial<StudyState>): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
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
    displayStatus: 'DRAFT',
    ...overrides,
})

describe('Tier-1 ↔ Tier-2 consistency', () => {
    // Representative states the dashboard 'View' link is emitted for.
    const viewStates: StudyState[] = [
        full({ status: 'PENDING-REVIEW', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeDecision: 'CODE-APPROVED' }),
        full({ status: 'APPROVED', isDraft: false, codeAwaitingDecision: true, hasSubmittedCode: true }),
        full({ status: 'REJECTED', isDraft: false }),
        full({ status: 'CHANGE-REQUESTED', isDraft: false }),
        full({ status: 'APPROVED', isDraft: false, hasResults: true, resultsApproved: true }),
    ]

    for (const s of viewStates) {
        it(`status=${s.status} code=${s.codeDecision} → 'View' route resolves to a real screen`, () => {
            const action = resolveDashboardAction('researcher', s as DashboardState, ctx)
            if (action.label !== 'View') return // only assert View links land on a real /view screen
            expect(resolveScreen('researcher', s, undefined, ctx).screen).not.toBe('study-overview')
        })
    }
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/study-screen/consistency.test.ts`
Expected: PASS. If a state resolves to `study-overview`, either add a `SCREEN_RULES` row for it or adjust the Tier-1 rule — the tiers genuinely disagree and that is the bug this test exists to catch.

- [ ] **Step 4: Run the whole module's tests**

Run: `pnpm exec vitest run src/lib/study-screen/`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/study-screen/index.ts src/lib/study-screen/consistency.test.ts
git commit -m "feat(study-screen): public index + Tier-1/Tier-2 consistency invariant"
```

---

## Phase 3 — Data fetching

### Task 8: `rawStudyStateForStudy` query (all jobs + statuses + files, one round-trip)

**Files:**

- Create: `src/server/db/study-state-query.ts`
- Test: `src/server/db/study-state-query.test.ts`

- [ ] **Step 1: Write the failing test (uses the real test DB per CONVENTIONS — do not mock the DB)**

`insertTestStudyJobData` (tests/unit.helpers.tsx:270) creates a study + one job + one status and
returns `{ job, org, study, studyJobStatus, latestJobWithStatus }`. It takes a single `jobStatus`
(not a list), so to add a second status row we insert one directly via the exported `db`.

```ts
import { db, describe, expect, it, insertTestStudyJobData } from '@/tests/unit.helpers'
import { rawStudyStateForStudy } from './study-state-query'

describe('rawStudyStateForStudy', () => {
    it('returns the study with its jobs, statuses, and files', async () => {
        const { study, job } = await insertTestStudyJobData({ studyStatus: 'APPROVED', jobStatus: 'CODE-SUBMITTED' })
        // add a second status row on the same job so we assert the full set comes back
        await db.insertInto('jobStatusChange').values({ status: 'CODE-APPROVED', studyJobId: job.id }).execute()

        const raw = await rawStudyStateForStudy(study.id)
        expect(raw).not.toBeNull()
        expect(raw!.status).toBe('APPROVED')
        expect(raw!.jobs.length).toBeGreaterThanOrEqual(1)
        const allStatuses = raw!.jobs.flatMap((j) => j.statusChanges.map((c) => c.status))
        expect(allStatuses).toContain('CODE-SUBMITTED')
        expect(allStatuses).toContain('CODE-APPROVED')
    })

    it('returns null for an unknown study id', async () => {
        expect(await rawStudyStateForStudy('019000000000-0000-0000-0000-0000000000ff')).toBeNull()
    })
})
```

> If `jobStatusChange` insert requires a non-null `userId` (check the column), pass
> `study.researcherId` — but `insertTestStudyJobData` inserts its own status row without one only
> because `userId` is nullable there; mirror whatever that helper does.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/server/db/study-state-query.test.ts`
Expected: FAIL ("rawStudyStateForStudy is not a function").

- [ ] **Step 3: Implement `study-state-query.ts`**

```ts
import { db, jsonArrayFrom } from '@/database'
import type { RawStudyState } from '@/lib/study-screen'

export async function rawStudyStateForStudy(studyId: string): Promise<RawStudyState | null> {
    const row = await db
        .selectFrom('study')
        .where('study.id', '=', studyId)
        .select([
            'study.status',
            'study.approvedAt',
            'study.rejectedAt',
            'study.researcherAgreementsAckedAt',
            'study.reviewerAgreementsAckedAt',
            'study.language',
            'study.proposalResubmissionNoteDraft',
            'study.codeResubmissionNoteDraft',
        ])
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('studyJob')
                    .whereRef('studyJob.studyId', '=', 'study.id')
                    // jobs ordered by id desc so the projection's latest = first; order is not relied on
                    // for correctness (projection re-selects by max(id)), only for stable output.
                    .orderBy('studyJob.id', 'desc')
                    .select(['studyJob.id'])
                    .select((j) => [
                        jsonArrayFrom(
                            j
                                .selectFrom('jobStatusChange')
                                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                                .select(['jobStatusChange.status']),
                        ).as('statusChanges'),
                        jsonArrayFrom(
                            j
                                .selectFrom('studyJobFile')
                                .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id')
                                .select(['studyJobFile.fileType']),
                        ).as('files'),
                    ]),
            ).as('jobs'),
        ])
        .executeTakeFirst()

    return row ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/server/db/study-state-query.test.ts`
Expected: PASS (2 tests). If `jsonArrayFrom` import path differs, it is re-exported from `@/database` (used the same way in `src/server/db/queries.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/study-state-query.ts src/server/db/study-state-query.test.ts
git commit -m "feat(db): rawStudyStateForStudy single-query bundle for state machine"
```

---

### Task 9: Dashboard row → `RawStudyState` mapper

**Files:**

- Create: `src/components/dashboard/studies-table/dashboard-raw-state.ts`
- Test: `src/components/dashboard/studies-table/dashboard-raw-state.test.ts`

> The dashboard already has the latest job's statuses on `StudyRow.jobStatusChanges`
> (`types.ts:19`) and the draft-note columns are NOT on `StudyRow` today. The mapper synthesizes
> a single-job `RawStudyState` from the row; the two facts the dashboard can't supply
> (`submissionRound`, `hasSavedEdits*`) are excluded by `DashboardState` and never read by
> dashboard-tier code, so the mapper passes `null` draft-notes and a single synthesized job.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { StudyRow } from './types'
import { dashboardRawStateFromRow } from './dashboard-raw-state'
import { projectStudyState } from '@/lib/study-screen'

const row = (overrides: Partial<StudyRow>): StudyRow => ({
    id: '019000000000-0000-0000-0000-000000000001',
    title: 't',
    status: 'APPROVED',
    createdAt: new Date(),
    submittedAt: null,
    lastUpdatedAt: new Date(),
    reviewerName: null,
    researcherId: 'r',
    reviewerId: null,
    createdBy: null,
    jobStatusChanges: [{ status: 'CODE-SUBMITTED' }, { status: 'CODE-APPROVED' }],
    researcherAgreementsAckedAt: null,
    ...overrides,
})

describe('dashboardRawStateFromRow', () => {
    it('synthesizes a single-job RawStudyState that projects the right code decision', () => {
        const raw = dashboardRawStateFromRow(row({}))
        const state = projectStudyState(raw)
        expect(state.codeDecision).toBe('CODE-APPROVED')
        expect(state.hasSubmittedCode).toBe(true)
    })
    it('maps researcherAgreementsAckedAt', () => {
        const state = projectStudyState(dashboardRawStateFromRow(row({ researcherAgreementsAckedAt: new Date() })))
        expect(state.researcherAgreementsAcked).toBe(true)
    })
    it('no job activity → empty jobs', () => {
        const state = projectStudyState(dashboardRawStateFromRow(row({ jobStatusChanges: [] })))
        expect(state.hasAnyJob).toBe(false)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/dashboard-raw-state.test.ts`
Expected: FAIL ("dashboardRawStateFromRow is not a function").

- [ ] **Step 3: Implement `dashboard-raw-state.ts`**

```ts
import type { RawStudyState } from '@/lib/study-screen'
import type { StudyRow } from './types'

// The dashboard row carries only the LATEST job's statuses (study.actions.ts builds a
// latestStudyJob CTE). Synthesize a single-job RawStudyState; the projection's latest-job
// selection trivially returns that one job. Draft-note columns aren't on the row, so the
// hasSavedEdits* facts are null here — DashboardState excludes them, so they're never read.
export function dashboardRawStateFromRow(study: StudyRow): RawStudyState {
    const hasActivity = study.jobStatusChanges.length > 0
    return {
        status: study.status,
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: study.researcherAgreementsAckedAt,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: hasActivity
            ? [{ id: '0', statusChanges: study.jobStatusChanges.map((c) => ({ status: c.status })), files: [] }]
            : [],
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/dashboard-raw-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/studies-table/dashboard-raw-state.ts src/components/dashboard/studies-table/dashboard-raw-state.test.ts
git commit -m "feat(dashboard): row → RawStudyState mapper for state machine"
```

---

## Phase 4 — Cut over the dashboard (pill, highlight, link)

### Task 10: Dashboard row highlight via `resolveRowHighlight`

**Files:**

- Modify: `src/components/dashboard/studies-table/study-row.tsx`
- Test: `src/components/dashboard/studies-table/study-row.test.tsx` (create if absent)

- [ ] **Step 1: Write/extend a test asserting highlight matches the resolver**

```tsx
import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyRow } from './study-row'
import type { StudyRow as StudyRowType } from './types'

const baseRow = (overrides: Partial<StudyRowType>): StudyRowType => ({
    id: '019000000000-0000-0000-0000-000000000001',
    title: 'My study',
    status: 'PENDING-REVIEW',
    createdAt: new Date(),
    submittedAt: null,
    lastUpdatedAt: new Date(),
    reviewerName: null,
    researcherId: 'r',
    reviewerId: null,
    createdBy: null,
    jobStatusChanges: [],
    researcherAgreementsAckedAt: null,
    ...overrides,
})

describe('StudyRow highlight', () => {
    it('reviewer row for a PENDING-REVIEW study is highlighted (fw 600 link)', () => {
        renderWithProviders(
            <StudyRow
                study={baseRow({ status: 'PENDING-REVIEW' })}
                audience="reviewer"
                scope="org"
                orgSlug="enclave"
            />,
        )
        const link = screen.getByRole('link', { name: /view/i })
        expect(link).toHaveStyle({ fontWeight: '600' })
    })
})
```

- [ ] **Step 2: Run to verify it fails (or passes pre-existing) — establish baseline**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/study-row.test.tsx`
Expected: FAIL if file is new and `shouldHighlight` logic differs; otherwise establishes current behavior. If it already passes against the OLD `shouldHighlight`, that's fine — the next step keeps it green while swapping the implementation.

- [ ] **Step 3: Replace `shouldHighlight` body with the resolver**

In `src/components/dashboard/studies-table/study-row.tsx`, replace the `shouldHighlight` function:

```tsx
import { projectStudyState, resolveRowHighlight } from '@/lib/study-screen'
import { dashboardRawStateFromRow } from './dashboard-raw-state'

function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    return resolveRowHighlight(audience, projectStudyState(dashboardRawStateFromRow(study)))
}
```

Remove the now-unused imports `studyHasJobStatus` and `latestCodeChangeIsSubmission` from this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/study-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/studies-table/study-row.tsx src/components/dashboard/studies-table/study-row.test.tsx
git commit -m "refactor(dashboard): row highlight via resolveRowHighlight"
```

---

### Task 11: Status pill via `resolvePillStatus`

**Files:**

- Modify: `src/hooks/use-study-status.ts`
- Test: `src/hooks/use-study-status.test.ts` (extend if present; otherwise the pill behavior is covered by `pill.test.ts` — still add a wrapper smoke test)

- [ ] **Step 1: Write a test asserting the hook delegates to the resolver**

```ts
import { describe, expect, it } from '@/tests/unit.helpers'
import { renderHook } from '@/tests/unit.helpers'
import { useStudyStatus } from './use-study-status'

describe('useStudyStatus (delegates to resolvePillStatus)', () => {
    it('researcher hides Errored until reviewer files a decision', () => {
        const { result } = renderHook(() =>
            useStudyStatus({
                studyStatus: 'APPROVED',
                audience: 'researcher',
                jobStatusChanges: [{ status: 'CODE-APPROVED' }, { status: 'JOB-ERRORED' }],
            }),
        )
        // Returns a StatusLabel; researcher should not see "Errored"
        expect((result.current as { label?: string }).label).not.toBe('Errored')
    })
})
```

> Confirm the current return type of `useStudyStatus` (spec notes it returns `StatusLabel`).
> If the real signature returns `{ statusLabel, displayedStatus }` (see the `UseStudyStatusReturn`
> type in the file), keep that public shape and only swap the internals — adjust the assertion to
> read `.statusLabel.label`. Do NOT change the hook's return shape in this task; callers depend on it.

- [ ] **Step 2: Run to verify current behavior**

Run: `pnpm exec vitest run src/hooks/use-study-status.test.ts`
Expected: PASS against existing implementation (baseline).

- [ ] **Step 3: Rewrite the hook internals to delegate**

Replace the body of `useStudyStatus` in `src/hooks/use-study-status.ts` so it builds a single-job `RawStudyState` from its `jobStatusChanges` arg, projects it, and calls `resolvePillStatus` — preserving the existing return shape:

```ts
import { projectStudyState, resolvePillStatus } from '@/lib/study-screen'
import type { StudyStatus } from '@/database/types'
import type { StatusLabel } from '@/lib/status-labels'

export type MinimalStatusChange = { status: StudyJobStatus }
export type UseStudyStatusParams = {
    studyStatus: StudyStatus
    audience: 'reviewer' | 'researcher'
    jobStatusChanges: MinimalStatusChange[]
}

export const useStudyStatus = ({ studyStatus, audience, jobStatusChanges }: UseStudyStatusParams): StatusLabel => {
    const state = projectStudyState({
        status: studyStatus,
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: jobStatusChanges.length ? [{ id: '0', statusChanges: jobStatusChanges, files: [] }] : [],
    })
    return resolvePillStatus(audience, state)
}
```

> IMPORTANT: If the existing `useStudyStatus` return type is `UseStudyStatusReturn`
> (`{ statusLabel, displayedStatus }`) rather than a bare `StatusLabel`, KEEP that shape: return
> `{ statusLabel: resolvePillStatus(...), displayedStatus: state.displayStatus }`. Check every
> caller (`study-row.tsx`, stories) and match what they read. Delete `dropStaleCodeDecisions` and
> the `STATUS_KEYS`/`LABELS` machinery from this file once unused.

- [ ] **Step 4: Run hook test + the pure pill test**

Run: `pnpm exec vitest run src/hooks/use-study-status.test.ts src/lib/study-screen/pill.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (catches caller return-shape mismatches)**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. Fix any caller that read a field the new shape doesn't provide.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-study-status.ts src/hooks/use-study-status.test.ts
git commit -m "refactor(dashboard): status pill via resolvePillStatus"
```

---

### Task 12: Dashboard link via `resolveDashboardAction`

**Files:**

- Modify: `src/components/dashboard/studies-table/study-action-link.tsx`
- Test: `src/components/dashboard/studies-table/study-action-link.test.tsx` (exists)

- [ ] **Step 1: Read the existing test to preserve its expectations**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/study-action-link.test.tsx`
Expected: PASS (baseline). These assert hrefs like `/${ORG_SLUG}/study/${STUDY_ID}/view` and `Edit` for drafts — the resolver must reproduce them.

- [ ] **Step 2: Rewrite `ResearcherLink` to use the resolver**

In `study-action-link.tsx`, replace the `ResearcherLink` body so the label/href/secondaryAction come from `resolveDashboardAction`, keeping the DRAFT author check for the delete button:

```tsx
import { projectStudyState, resolveDashboardAction } from '@/lib/study-screen'
import { dashboardRawStateFromRow } from './dashboard-raw-state'

function ResearcherLink({
    study,
    orgSlug,
    scope,
    isHighlighted,
}: {
    study: StudyRow
    orgSlug: string
    scope: Scope
    isHighlighted: boolean
}) {
    const { session } = useSession()
    const labSlug = study.submittedByOrgSlug || orgSlug
    const action = resolveDashboardAction('researcher', projectStudyState(dashboardRawStateFromRow(study)), {
        orgSlug: labSlug,
        studyId: study.id,
    })
    const href = scope === 'org' ? (`${action.href}?returnTo=org` as typeof action.href) : action.href

    if (action.secondaryAction === 'delete-draft') {
        const isAuthor = session?.user.id === study.researcherId
        return (
            <Group gap="xs" justify="center" wrap="nowrap">
                <Link href={action.href} aria-label={`Edit draft study ${study.title}`}>
                    {action.label}
                </Link>
                {isAuthor && <DeleteDraftButton study={study} />}
            </Group>
        )
    }

    return (
        <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
            {action.label}
        </Link>
    )
}
```

Remove the now-unused `useStudyHref` import and the `Routes`/`hasJobActivity`/`jobStatuses` locals it fed.

- [ ] **Step 3: Run the existing test to verify it still passes**

Run: `pnpm exec vitest run src/components/dashboard/studies-table/study-action-link.test.tsx`
Expected: PASS. If a `Continue upload` case now differs from the old `useStudyHref` (old returned `/code` for APPROVED+job+no-code), confirm the test expectation matches `resolveDashboardAction` — they should agree by construction (Task 5 rule mirrors `use-study-href.ts:17`).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/studies-table/study-action-link.tsx
git commit -m "refactor(dashboard): action link via resolveDashboardAction"
```

---

## Phase 5 — Cut over the researcher `/view` page

> This phase adapts existing researcher view components into a `SCREEN_COMPONENTS` registry and
> rewrites `view/page.tsx` to fetch raw state → `resolveScreen` → render. To keep tasks
> bite-sized and avoid a giant single commit, build the registry incrementally: a renderer that
> falls back to the CURRENT page output for any screen not yet wired, then wire screens one at a
> time. This keeps the app working at every commit.

### Task 13: Screen component contract + renderer with passthrough fallback

**Files:**

- Create: `src/app/[orgSlug]/study/[studyId]/_screens/types.ts`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/study-nav-buttons.tsx`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/registry.ts`
- Create: `src/app/[orgSlug]/study/[studyId]/_screens/study-screen-renderer.tsx`
- Test: `src/app/[orgSlug]/study/[studyId]/_screens/study-screen-renderer.test.tsx`

- [ ] **Step 1: Create `types.ts`**

```ts
import type { ScreenDescriptor } from '@/lib/study-screen'
import type { RawStudyState } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'

export type ScreenComponentProps = {
    descriptor: ScreenDescriptor
    study: SelectedStudy
    raw: RawStudyState
    orgSlug: string
    dashboardHref: string
}
```

- [ ] **Step 2: Create `study-nav-buttons.tsx`**

Renders `descriptor.back`/`forward`. Route buttons render as links; intent buttons call a
passed `onIntent(intent)` callback (the actual server-action wiring for those intents is a
deferred follow-up — in this plan no rendered screen emits an intent button, so `onIntent` is
supplied but unexercised).

```tsx
'use client'
import { Button, Group } from '@mantine/core'
import { Link } from '@/components/links'
import type { Route } from 'next'
import type { ButtonDescriptor, ScreenIntent } from '@/lib/study-screen'

type Props = { back?: ButtonDescriptor; forward?: ButtonDescriptor; onIntent: (intent: ScreenIntent) => void }

function NavButton({
    button,
    variant,
    onIntent,
}: {
    button: ButtonDescriptor
    variant: 'default' | 'primary'
    onIntent: (i: ScreenIntent) => void
}) {
    if (button.target.kind === 'route') {
        return (
            <Button component={Link} href={button.target.href as Route} variant={variant} size="md">
                {button.title}
            </Button>
        )
    }
    const intent = button.target.intent
    return (
        <Button variant={variant} size="md" onClick={() => onIntent(intent)}>
            {button.title}
        </Button>
    )
}

export function StudyNavButtons({ back, forward, onIntent }: Props) {
    if (!back && !forward) return null
    return (
        <Group justify="space-between" mt="xxl">
            {back ? <NavButton button={back} variant="default" onIntent={onIntent} /> : <span />}
            {forward ? <NavButton button={forward} variant="primary" onIntent={onIntent} /> : <span />}
        </Group>
    )
}
```

- [ ] **Step 3: Create `registry.ts` with a passthrough placeholder for every screen**

```ts
import type { ScreenId } from '@/lib/study-screen'
import type { ScreenComponentProps } from './types'

export type ScreenComponent = (props: ScreenComponentProps) => React.ReactNode

// Each entry is wired in its own task. Until then the renderer uses the legacy page output
// (see study-screen-renderer.tsx passthrough). This Record is exhaustive so adding a ScreenId
// fails the build until mapped.
export const SCREEN_COMPONENTS: Partial<Record<ScreenId, ScreenComponent>> = {}
```

- [ ] **Step 4: Create `study-screen-renderer.tsx` (server) with passthrough**

```tsx
import type { ScreenComponentProps } from './types'
import { SCREEN_COMPONENTS } from './registry'

// Renders the registered component for descriptor.screen. When a screen isn't wired yet,
// `fallback` (the legacy page output) is rendered so the app keeps working during migration.
export function StudyScreenRenderer({ props, fallback }: { props: ScreenComponentProps; fallback: React.ReactNode }) {
    const Component = SCREEN_COMPONENTS[props.descriptor.screen]
    if (!Component) return <>{fallback}</>
    return <>{Component(props)}</>
}
```

- [ ] **Step 5: Write a renderer test (registered screen wins; unregistered → fallback)**

```tsx
import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyScreenRenderer } from './study-screen-renderer'
import { SCREEN_COMPONENTS } from './registry'
import type { ScreenComponentProps } from './types'

const props = (screenId: string): ScreenComponentProps => ({
    descriptor: { screen: screenId as ScreenComponentProps['descriptor']['screen'] },
    study: {} as ScreenComponentProps['study'],
    raw: {
        status: 'DRAFT',
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: [],
    },
    orgSlug: 'lab',
    dashboardHref: '/dashboard',
})

describe('StudyScreenRenderer', () => {
    it('renders fallback when screen not registered', () => {
        renderWithProviders(<StudyScreenRenderer props={props('study-overview')} fallback={<div>LEGACY</div>} />)
        expect(screen.getByText('LEGACY')).toBeInTheDocument()
    })
    it('renders the registered component when present', () => {
        SCREEN_COMPONENTS['study-overview'] = () => <div>WIRED</div>
        renderWithProviders(<StudyScreenRenderer props={props('study-overview')} fallback={<div>LEGACY</div>} />)
        expect(screen.getByText('WIRED')).toBeInTheDocument()
        delete SCREEN_COMPONENTS['study-overview']
    })
})
```

- [ ] **Step 6: Run renderer test**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/_screens/study-screen-renderer.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/_screens"
git commit -m "feat(study-screen): screen renderer + registry scaffold with passthrough"
```

---

### Task 14: Wire `view/page.tsx` to project + resolve, keep legacy fallback

**Files:**

- Modify: `src/app/[orgSlug]/study/[studyId]/view/page.tsx`
- Test: `src/app/[orgSlug]/study/[studyId]/view/page.test.tsx` (exists)

> Strategy: compute the descriptor at the top of the page and pass the EXISTING rendered output
> as `fallback`. Because the registry is empty, behavior is byte-identical to today — this task
> only introduces the projection/resolution call and proves the page still renders. Subsequent
> tasks (out of scope here / follow-up) move each branch into a registered screen and delete the
> corresponding legacy branch.

- [ ] **Step 1: Run the existing page test (baseline)**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Add projection at the top of the page, wrap output in the renderer**

At the top of `StudyReviewPage` (researcher `view/page.tsx`), after loading `study`, add:

```tsx
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { projectStudyState, resolveScreen } from '@/lib/study-screen'
import { StudyScreenRenderer } from '../_screens/study-screen-renderer'

// ... inside the component, after `const study = actionResult(...)`:
const raw = await rawStudyStateForStudy(studyId)
const screenProps = raw
    ? {
          descriptor: resolveScreen('researcher', projectStudyState(raw), searchParams.step, { orgSlug, studyId }),
          study,
          raw,
          orgSlug,
          dashboardHref,
      }
    : null
```

Then wrap the entire existing returned JSX of the function in:

```tsx
return <StudyScreenRenderer props={screenProps!} fallback={/* the existing JSX this function returns today */} />
```

> Because no screens are registered yet, the renderer always shows the fallback, so this is a
> behavior-preserving change. The `raw === null` case keeps the legacy output (screenProps null
> path) — when you wire screens, guard `screenProps!` properly.

- [ ] **Step 3: Run the page test — must stay green**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx"`
Expected: PASS (unchanged behavior).

- [ ] **Step 4: Typecheck + full unit run**

Run: `pnpm run checks && pnpm exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/view/page.tsx"
git commit -m "feat(study-view): compute screen descriptor at page top (legacy fallback)"
```

---

### Task 15: Wire the simplest leaf screen — `proposal-feedback` — end to end

**Files:**

- Create: `src/app/[orgSlug]/study/[studyId]/_screens/proposal-feedback-screen.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/_screens/registry.ts`
- Modify: `src/app/[orgSlug]/study/[studyId]/view/page.tsx` (remove the now-dead `showProposalView` branch for REJECTED/APPROVED/CHANGE-REQUESTED)
- Test: extend `view/page.test.tsx`

> Pick `proposal-feedback` first: it maps to the existing `ResearcherProposalView` and is a
> read-only leaf (no intent buttons), so wiring it is low-risk and demonstrates the full path:
> registry entry → renderer picks it → legacy branch deleted.

- [ ] **Step 1: Create the screen wrapper adapting the existing component**

```tsx
import { ResearcherProposalView } from '../view/researcher-proposal-view'
import type { ScreenComponentProps } from './types'

// Adapts the existing read-only proposal view. The machine supplies the forward/back via
// descriptor, so this wrapper passes dashboardHref through and lets the view render the proposal.
export function ProposalFeedbackScreen({ study, orgSlug, dashboardHref }: ScreenComponentProps) {
    return <ResearcherProposalView orgSlug={orgSlug} study={study} dashboardHref={dashboardHref} />
}
```

- [ ] **Step 2: Register it**

In `registry.ts`:

```ts
import { ProposalFeedbackScreen } from './proposal-feedback-screen'
export const SCREEN_COMPONENTS: Partial<Record<ScreenId, ScreenComponent>> = {
    'proposal-feedback': ProposalFeedbackScreen,
}
```

- [ ] **Step 3: Write the test — a CHANGE-REQUESTED study renders the proposal view through the machine**

```tsx
// in view/page.test.tsx, add a case that renders the page for a CHANGE-REQUESTED study and
// asserts the proposal content shows (same assertion the old showProposalView path used).
```

(Use the existing test's setup helpers; assert on a stable element the proposal view renders, e.g. the study title or "Study request" heading.)

- [ ] **Step 4: Remove the dead legacy branch**

In `view/page.tsx`, delete the `showProposalView` block that returned `<ResearcherProposalView>` for `REJECTED`/`APPROVED`/`CHANGE-REQUESTED` (the renderer now handles it). Keep the branch's other responsibilities (e.g. `agreementsHref`) only if a remaining fallback path needs them; otherwise remove.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[orgSlug]/study/[studyId]/_screens/proposal-feedback-screen.tsx" "src/app/[orgSlug]/study/[studyId]/_screens/registry.ts" "src/app/[orgSlug]/study/[studyId]/view/page.tsx" "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx"
git commit -m "feat(study-view): wire proposal-feedback screen via registry"
```

> **Follow-up (separate plan):** wire the remaining researcher screens (`proposal-submitted`,
> `code-under-review`, `code-approved`, `code-feedback`, `code-upload`, `agreements`,
> `study-results`, `proposal-edit`) one task each, deleting each legacy branch as it migrates,
> then add the intent→action wiring (`intents.ts`) for `submit-code`/`resubmit-code` confirm
> modals. Each follows the exact pattern of Task 15. This is deferred because several touch
> `?from=` navigation and route shapes that need the §8/§12 route-change approval.

---

## Phase 6 — Delete dead order-dependent helpers

### Task 16: Remove retired helpers once callers are gone

**Files:**

- Modify: `src/lib/study-job-status.ts`
- Delete: `src/hooks/use-study-href.ts`
- Modify: any remaining importers surfaced by the grep below.

- [ ] **Step 1: Prove `use-study-href.ts` has no importers**

Run: `grep -rn "use-study-href\|useStudyHref" src/ | grep -v "\.test\."`
Expected: NO results (Task 12 removed the last import). If any remain, migrate them to `resolveDashboardAction` before deleting.

- [ ] **Step 2: Delete `use-study-href.ts` and its test**

```bash
git rm src/hooks/use-study-href.ts src/hooks/use-study-href.test.ts 2>/dev/null || git rm src/hooks/use-study-href.ts
```

- [ ] **Step 3: Prove the three order-dependent helpers have no non-test callers**

Run:

```bash
grep -rn "latestCodeChangeIsSubmission\|latestSubmittedJobHasLiveCodeDecision\|latestSubmittedJobLiveCodeDecisionStatus" src/ | grep -v "study-job-status.ts" | grep -v "\.test\."
```

Expected: results ONLY in `src/app/[orgSlug]/study/[studyId]/review/page.tsx` (the reviewer page, out of scope) — and possibly `use-study-status.ts` if Task 11 left a stray (it should not).

- [ ] **Step 4: Decision gate on deletion**

- IF the only remaining caller is the reviewer `review/page.tsx`: **do NOT delete** `latestSubmittedJobHasLiveCodeDecision` / `latestSubmittedJobLiveCodeDecisionStatus` yet (the reviewer page still uses them; its migration is a follow-up plan). **Delete only `latestCodeChangeIsSubmission`** if and only if it now has zero non-test callers.
- IF a helper has zero non-test callers: delete it and its dedicated tests.

Make the deletions that satisfy the gate, e.g. if `latestCodeChangeIsSubmission` is unused:

```ts
// remove the `latestCodeChangeIsSubmission` export and its doc comment from study-job-status.ts
```

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm run checks && pnpm exec vitest run`
Expected: PASS. Any failure means a caller still depends on a deleted symbol — restore or migrate it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(study-screen): delete dead order-dependent routing helpers"
```

---

## Final verification

### Task 17: Full validation pass

- [ ] **Step 1: Lint/format**

Run: `pnpm run lint:fix`
Expected: clean (no remaining errors).

- [ ] **Step 2: Unit tests**

Run: `pnpm run test:unit`
Expected: PASS.

- [ ] **Step 3: Type + action validation**

Run: `pnpm run checks`
Expected: PASS.

- [ ] **Step 4: Manual smoke (researcher dashboard + view)**

Per the `run` skill / project dev instructions, start the app and confirm: a researcher's
dashboard shows correct pills/links across draft, pending-review, approved-no-code,
code-under-review, approved, and results studies; clicking "View" lands on the same screen the
legacy code did (proposal-feedback wired; others via fallback). No `?from=`-dependent regressions
on the researcher view.

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "chore(study-screen): final validation fixups"
```

---

## Notes for the implementer

- **Never read `statusChanges[0]`** anywhere in `src/lib/study-screen/`. All status questions are
  set-existence; the only ordering is latest-job-by-`max(id)`. The shuffle test (Task 3) enforces this.
- **Do not change server-action behavior.** The machine names intents; actions stay as-is.
- **Do not modify `src/lib/permissions.ts` or `src/lib/routes/definitions.ts`** without explicit
  approval (CLAUDE.md stop conditions). This plan uses existing `Routes.*` builders only.
- **Reviewer page is untouched.** It keeps its current helpers until a follow-up plan migrates it.
- If `pnpm run test:unit` surfaces any unrelated failing/warning test, fix it (per the user's
  global instruction to fix errors regardless of origin) — do not skip.
