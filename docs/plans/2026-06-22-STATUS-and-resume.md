# Study Screen State Machine — STATUS & Resume Guide

**Last updated:** 2026-06-22
**Branch:** `study-screen-state-machine` (in worktree `/Users/nas/code/si/management-app-study-screen`)
**Base:** `origin/main` @ `508ba642`. ~58 commits ahead. Working tree clean.

This is the single "where are we / how to pick up" doc. The design + task detail live in the
companion docs (see bottom). The plan's `- [ ]` checkboxes were NOT maintained during execution —
**this file is the source of truth for progress**, not those checkboxes.

---

## What this work is

Replace the four scattered, order-dependent study-routing decision sites with one pure, auditable
state machine (`src/lib/study-screen/`). A study's full state is projected into a flat `StudyState`,
and ordered rule tables resolve the screen / dashboard-link / pill / highlight. See
`2026-06-22-study-screen-state-machine-design.md`.

**Scope expanded twice during execution (both approved):**

1. Full `?from=` elimination on the **researcher** flow (not just the dashboard).
2. A **job round-boundary bug fix** (a `CODE-CHANGES-REQUESTED` resubmission was wrongly minting a
   new `studyJob`; it now reuses the job). See `2026-06-22-job-round-boundary-fix-subspec.md`.

---

## DONE (committed, reviewed, green)

**Pure state machine — `src/lib/study-screen/`** (all unit-tested, order-independence shuffle test passing):

- `state.types.ts`, `state.ts` (`projectStudyState`) — latest-job-by-`max(id)` + set/count existence.
    - `codeDecision` uses **count-based liveness** (`decisionCount >= submittedCount` on the latest job).
    - `latestJob` keeps a **defensive INITIATED-skip** (prefers the latest non-INITIATED-only job).
- `screens.ts` — `ScreenId` union is exactly the **6 real screens**:
  `proposal-feedback | code-under-review | code-approved | code-feedback | study-results | study-overview`.
  (Phantom ids `agreements`/`code-upload`/`proposal-submitted`/`proposal-edit`/`code-edit` were removed.)
- `screen-rules.ts` (`SCREEN_RULES`), `dashboard-rules.ts` (`DASHBOARD_RULES`), `resolve.ts`
  (`resolveScreen`, `resolveDashboardAction`), `pill.ts` (`resolvePillStatus`, `resolveRowHighlight`),
  `index.ts`. All back/forward hrefs are plain routes (NO `?from=`); `returnTo` is threaded via ctx.

**Data layer:**

- `src/server/db/study-state-query.ts` — `rawStudyStateForStudy(studyId)` (one round-trip, all jobs).
- `src/components/dashboard/studies-table/dashboard-raw-state.ts` — `dashboardRawStateFromRow`.

**Dashboard cutover (fully migrated, faithful to legacy):**

- Row highlight → `resolveRowHighlight` (`study-row.tsx`).
- Status pill → `resolvePillStatus` (`use-study-status.ts` now delegates).
- Action link → `resolveDashboardAction` (`study-action-link.tsx`). `use-study-href.ts` is now
  UNUSED (deleted in Task 16 — see "remaining").

**Researcher `/view` — CASCADE DELETED:**

- `view/page.tsx` is now ~42 lines (was 265): `fetch → projectStudyState → resolveScreen → render`.
  Zero `?from=` reads. Throws if a screen isn't registered (registry is total).
- 6 screen wrappers in `src/app/[orgSlug]/study/[studyId]/_screens/`:
  `proposal-feedback-screen`, `study-results-screen`, `code-under-review-screen`,
  `code-decision-screen` (serves both code-approved & code-feedback), `study-overview-screen`,
  plus `registry.ts` + `types.ts`. Each is an async server component that loads its own data and
  renders the existing legacy leaf component (`ResearcherProposalView`, `StudyDetailsResearcher`,
  `CodePostSubmissionView`, `CodePostDecisionView`). `?from=previous` dropped from those leaves.
- `StudyScreenRenderer` (a Task-13 scaffold) was deleted — the page awaits screen functions directly
  (the verified async-server-component render pattern: await + return, NOT JSX child).
- `loadCodeReviewFeedback` extracted to `view/load-code-review-feedback.ts` (shared).

**Job round-boundary fix (write path):**

- `ROUND_CLOSING_JOB_STATUSES = ['FILES-APPROVED', 'FILES-REJECTED']` (new, in `code-resubmission.ts`).
- `getOrCreateCurrentRoundJob` uses it for `roundClosed` — so CODE-CHANGES-REQUESTED & JOB-ERRORED
  now REUSE the job; only post-run FILES-\* open a new round. `CODE_RESUBMITTABLE_JOB_STATUSES`
  (resubmit-eligibility gate) is UNCHANGED.
- Version: `codeSubmissionVersion(studyId)` = `count(CODE-CHANGES-REQUESTED on latest job) + 1`
  (replaced `countSubmittedJobsForStudy`; the old count-CODE-SUBMITTED idea was broken because
  `markCodeSubmitted` is idempotent).

---

## REMAINING (not started / in progress)

In suggested order. None of these are blocked.

- **15e — Tighten registry to `Record<ScreenId, ScreenComponent>`** (TRIVIAL, ~1 line). The registry
  is currently `Partial<Record<...>>` but all 6 ScreenIds are registered, so it can become a total
  `Record` (compiler-enforced exhaustiveness). IN PROGRESS — do this next.
- **15f/15g — Revisitable sub-pages stop redirecting on `?from=`.** Convert `/edit`, `/proposal`,
  `/agreements` (RESEARCHER branch only — it's shared with reviewer!), `/code`:
    - `edit/page.tsx`: delete the `from!=='step2' && draftHasStep2Progress` resume-redirect (keep the
      DRAFT-only auth guard).
    - `proposal/footer.tsx`: `handlePrevious` → `studyEdit` WITHOUT `from:'step2'`.
    - `agreements/page.tsx`: delete `isDirectAccess`/`from==='previous'` + the `!isDirectAccess`
      redirects for the RESEARCHER branch; drop its `from:'code-decision'` producer → plain `/view`.
      **Leave the reviewer branch of this page untouched.**
    - `code/page.tsx`: `previousHref` → `studyAgreements` WITHOUT `from:'previous'`.
    - Model: revisitable pages render WITHOUT a canonical-check redirect (a researcher can view
      agreements/upload even past those steps). See design §8 "two route kinds".
    - Migrate each page's tests.
- **15h — Migrate any remaining `?from=` researcher tests** to assert state-based routing + plain URLs.
  (Most `view/page.test.tsx` `?from=` tests were already migrated/deleted during the cascade work.)
- **15i — Remove `from` from researcher route builders in `definitions.ts`** (CLAUDE.md
  "ask before routes" — ALREADY APPROVED for this). Remove `from` from `studyView`, `studyEdit`.
  `studyAgreements` is SHARED with the reviewer — KEEP its `from` param on the builder if the
  reviewer still passes it; just ensure no researcher caller does. Grep-verify zero researcher
  `from=` producers/consumers.
- **16 — Delete dead helpers:** `git rm src/hooks/use-study-href.ts` (+ its test) — confirm zero
  importers first. Then delete `latestSubmittedJobHasLiveCodeDecision` /
  `latestSubmittedJobLiveCodeDecisionStatus` / `latestCodeChangeIsSubmission` from
  `study-job-status.ts` ONLY IF they have zero non-test callers (the **reviewer page** likely still
  uses some — gate each deletion on a grep; do NOT break the reviewer page).
- **17 — Final validation:** `pnpm run lint:fix`, `pnpm run test:unit`, `pnpm run checks`, manual smoke.

---

## OUT OF SCOPE (deliberately deferred — future work)

- **Reviewer `/review` page** + its `?from=` (initial-request/code-review/agreements/agreements-proceed)
  and its routes. The reviewer rule table in the state machine is stubbed (researcher-only). So
  `?from=` is NOT fully gone from the codebase after this branch — only from the researcher flow.
  `studyAgreements`'s `from` param likely stays for the reviewer.
- Intent→action modal wiring (`intents.ts`) for submit/resubmit confirm modals — the migrated
  researcher screens use existing route nav / their own component actions.
- `src/lib/permissions.ts` — untouched.

---

## KNOWN PRE-EXISTING TEST FAILURES (NOT ours — do NOT "fix" in this branch)

Verified by running on the base checkout (`3ef167a7`, none of our work) — they fail identically there:

- `src/components/study/study-code.test.tsx` ×3 — "submits IDE files…", "auto-selects…", "session
  timeout regression…".
- `src/app/[orgSlug]/study/[studyId]/code/code-upload.test.tsx` ×2 — "shows workspace files and
  allows submission", "routes to …/view after successful submit".

All five assert `expected 'APPROVED' to be 'PENDING-REVIEW'` — the code-submit action's status
transition not completing in the test harness (a repo-wide env issue unrelated to this work).
**When asserting "our suite is green", exclude these 5.** Everything else passes.

---

## HOW TO VERIFY CURRENT STATE

```bash
cd /Users/nas/code/si/management-app-study-screen
pnpm exec vitest run src/lib/study-screen/                                   # pure module — all green
pnpm exec vitest run "src/app/[orgSlug]/study/[studyId]/view/page.test.tsx" # /view — all green (34)
pnpm exec vitest run src/server/db/mutations.test.ts src/server/db/queries.test.ts  # job fix — green
pnpm exec tsc --noEmit                                                       # exit 0
pnpm run test:unit   # full suite: only the 5 pre-existing failures above
```

Worktree note: `.env` is a symlink to the main checkout's `.env` (gitignored). `node_modules` is
installed in the worktree.

---

## COMPANION DOCS

- `2026-06-22-study-screen-state-machine-design.md` — the architecture/spec (incl. the Core
  invariant, the two-route-kinds routing model, count-based liveness).
- `2026-06-22-study-screen-state-machine-plan.md` — the original task plan (checkboxes NOT maintained;
  use THIS status file for progress).
- `2026-06-22-researcher-view-screens-subspec.md` — the 6-screen model + per-screen data loads +
  decision log (e.g. `?from=agreements` proposal-on-/view removal).
- `2026-06-22-job-round-boundary-fix-subspec.md` — the job-model fix + version formula.
