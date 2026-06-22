# Researcher View Screens — Sub-Spec (for the `?from=` elimination)

**Date:** 2026-06-22
**Parent:** `2026-06-22-study-screen-state-machine-design.md` / `…-plan.md`
**Status:** Draft for review — derived from the AUTHORITATIVE legacy cascade in
`src/app/[orgSlug]/study/[studyId]/view/page.tsx`, not the product-spec sketch.

## Why this exists

Mid-execution we found the researcher-view migration is larger than the plan assumed: the `/view`
page renders **6 screens**, each an **async server component that re-loads its own branch data**
(code-review feedback, reviewing-org name, submission count, the job). The `SCREEN_RULES` written
in Task 4 were sketched from the product-spec table and **diverge from the real cascade** in
several places. This sub-spec re-derives the screen model from the cascade so implementation stops
hitting mid-task mismatches. The pure machine, the dashboard cutover, and the page plumbing
(Tasks 1–14) are done and unaffected.

## The 6 researcher `/view` screens (from the legacy cascade, in precedence order)

The legacy gate is `if (job && codeSubmitted && !fromAgreements)` then an inner cascade, else
`showProposalView`, else a generic layout. Re-expressed as state-machine screens (the machine
already has the facts; `?from=` is gone):

| #   | ScreenId                                             | Legacy component                                                                         | When (StudyState)                                                          | Extra data the wrapper must load                                                                                                  |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `study-results`                                      | `StudyDetailsResearcher`                                                                 | `hasResults`                                                               | `job` (`latestSubmittedJobForStudy`)                                                                                              |
| 2   | `code-approved`                                      | `CodePostDecisionView` (latestJobStatus `CODE-APPROVED`, `showStudyCode={!isExecuting}`) | `codeDecision==='CODE-APPROVED' \|\| isExecuting`                          | `job`, code-review `entries`+`feedbackLoadError` (`loadCodeReviewFeedback`), `reviewingOrgName` (`getOrgNameFromId(study.orgId)`) |
| 3   | `code-feedback`                                      | `CodePostDecisionView` (latestJobStatus = the decision)                                  | `codeDecision==='CODE-CHANGES-REQUESTED'` or `'CODE-REJECTED'`             | same as code-approved                                                                                                             |
| 4   | `code-under-review`                                  | `CodePostSubmissionView`                                                                 | `codeAwaitingDecision`                                                     | `job`, `reviewingOrgName`, `submissionVersion` (`countSubmittedJobsForStudy`), `feedbackEntries` (only if `submissionVersion>1`)  |
| 5   | `proposal-feedback`                                  | `ResearcherProposalView` (read-only, **no Proceed button**)                              | `status` is `REJECTED`/`APPROVED`/`CHANGE-REQUESTED` and no code submitted | none (study is enough)                                                                                                            |
| 6   | `proposal-edit` (DRAFT) / `study-overview` (generic) | the generic `<Stack>` layout                                                             | `isDraft`, or any unmapped state                                           | none                                                                                                                              |

Notes on fidelity to the cascade:

- **Precedence matches the cascade:** results (1) is checked before the decision branch (2/3),
  which is checked before under-review (4) — same as `page.tsx` lines 124/138/167. This is already
  how `SCREEN_RULES` is ordered.
- **`code-approved` vs `code-feedback` both use `CodePostDecisionView`**, differing only by the
  `latestJobStatus`/`showStudyCode` props. They are distinct `ScreenId`s so the rule table reads
  clearly, but they share ONE wrapper component parameterized by `descriptor`/state.
- The execution window (`isExecuting`) maps to `code-approved` with `showStudyCode=false`
  (OTTER-598) — the projection already exposes `isExecuting`.

## Corrections to `SCREEN_RULES` (Task 4 output) required

1. **`proposal-feedback` must have NO `forward`.** Task 4 gave the CHANGE-REQUESTED
   `proposal-feedback` rule a `forward: "Edit and resubmit" → studyEditAndResubmit`. That is WRONG:
   the legacy `/view` proposal view is **read-only with no button**. The "Edit and resubmit" CTA for
   a change-requested _proposal_ lives on the **`/submitted` page** (`proposal-submitted.tsx`),
   which the dashboard's Tier-1 link routes to (a `/submitted` href) — NOT on `/view`. So:
    - Remove the `forward` from the CHANGE-REQUESTED `proposal-feedback` rule.
    - REJECTED/APPROVED `proposal-feedback` keep `back: dashboard` only.
    - Net: `proposal-feedback` is always read-only proposal + (optional) a dashboard back.
2. **The `?from=agreements` "proposal with Proceed-to-Step-3" view has no `/view` screen.** In the
   legacy, `?from=agreements` made `/view` show the proposal WITH a "Proceed to Step 3 → agreements"
   button. Under the new model this is **not a `/view` screen** — it was pure navigation context.
   The agreements _page itself_ (`/agreements`, revisitable) is where a researcher reviews
   agreements; its own "Proceed"/"Previous" buttons handle that flow. So `/view` never needs the
   agreements-proceed variant. (This is the crux of why `?from=agreements` is deletable.)
3. **`code-approved` back → `/agreements`** (already set in Task 15a, correct: `/agreements` is
   revisitable and renders without bouncing).
4. **`study-results` has no back** (already fixed: terminal; `/view` self-loop avoided).
5. **`code-under-review` back → `/agreements`** (already set, correct).

## `ScreenComponentProps` is insufficient — screens load their own extras

Current: `{ descriptor, study, raw, orgSlug, dashboardHref }`. The decision/submission/results
screens need `job` + feedback + org-name + counts. Two options:

- **(A) Each wrapper is an async server component that fetches its own extras** (matches the
  design's "screens fetch their own extras" and the legacy cascade's per-branch loads). The
  registry's `ScreenComponent` type must allow `async` components (it already is
  `React.ComponentType`, and Next server components may be async — verify the renderer awaits
  correctly, or render via JSX which supports async server components).
- **(B) The page pre-loads a superset bundle and passes it in `ScreenComponentProps`.** Simpler
  typing but re-introduces "the page knows about every screen's data," which is the coupling we're
  removing.

**Recommendation: (A).** Each `*-screen.tsx` wrapper does its own `await loadCodeReviewFeedback` /
`getOrgNameFromId` / `countSubmittedJobsForStudy` / `latestSubmittedJobForStudy` as needed, then
renders the legacy component. This keeps `ScreenComponentProps` minimal and each screen
self-contained. The renderer renders `<Component {...props} />` (JSX) so async server components
work. The wrappers reuse the SAME helper functions the cascade uses (move `loadCodeReviewFeedback`
to a shared util).

OPEN VERIFICATION (do in the first wrapper task): confirm an `async` function component rendered
via `<Component {...props}/>` inside the (also async) `StudyScreenRenderer` works in this Next
version and in the vitest render harness. If the test harness can't render nested async server
components, fall back to (B) for the data-heavy screens (page pre-loads, passes via props) — decide
then. (The dashboard/pill/core are unaffected either way.)

## Revised task sequence (replaces 15b–15i)

- **15b-rules:** Fix `SCREEN_RULES` per "Corrections" above (drop proposal-feedback forward).
  Unit-test: CHANGE-REQUESTED `proposal-feedback` has NO forward. (pure module; fast)
- **15b-1 … 15b-6:** One wrapper per screen, registered + verified against `view/page.test.tsx`,
  data-loaded per the table. Order: `proposal-feedback` (no data) → `study-results` →
  `code-under-review` → `code-approved`/`code-feedback` (shared `CodePostDecisionView` wrapper) →
  `study-overview`. After each, the corresponding legacy branch is dead but stays until 15d.
- **15c:** (folded into 15b-6) extract the generic layout into `StudyOverviewScreen`.
- **15d:** delete the legacy cascade from `view/page.tsx` once all 6 are registered; the page
  becomes fetch→project→resolveScreen→render. Remove `latestSubmittedJobForStudy`, the OTTER
  helpers, and `searchParams.from` reads.
- **15e:** tighten registry to total `Record<ScreenId, …>`.
- **15f/15g:** revisitable sub-pages (`/edit`, `/proposal`, `/agreements`, `/code`) stop
  redirecting on `?from=`; keep their existing non-`?from=` auth guards (per the revisitable model
  already in the design doc §8). Delete `?from=step2`/`?from=previous` + their producers.
- **15h:** migrate `view/page.test.tsx` off `?from=` assertions.
- **15i:** remove `from` from researcher route builders in `definitions.ts`.

## Test-fidelity guardrails (apply throughout)

- `view/page.test.tsx` has 43 tests pinning the legacy screens. As each screen is wired, the
  matching tests must stay green (they assert the SAME rendered component output). The only tests
  that change are the `?from=`-context ones (15h): rewrite them to assert state-based routing +
  plain URLs. NEVER weaken an assertion to force green — if a wired screen renders differently than
  the legacy branch, that is a real fidelity bug to fix in the wrapper.
- Known pre-existing failures (`code-upload.test.tsx` ×2) stay out of scope.

## Out of scope (unchanged)

Reviewer `/review` page + its `?from=` and routes; intent→action modal wiring; `permissions.ts`.
