# Researcher View Screens — Sub-Spec (for the `?from=` elimination)

**Date:** 2026-06-22
**Parent:** `2026-06-22-study-screen-state-machine-design.md` / `…-plan.md`
**Status:** Draft for review — derived from the AUTHORITATIVE legacy cascade in
`src/app/[orgSlug]/study/[studyId]/view/page.tsx`, not the product-spec sketch.

> **⚠️ Corrections #1 and #4 below were reversed by OTTER-614 (2026-06-25):** `/view` is now a
> step-aware read-only wizard the researcher walks back and forth through (`?step=`), so
> `proposal-feedback` has a forward again and `study-results` is no longer terminal. Current
> behavior: `docs/study-screens-logic.md`, Stage 2. The rest of this sub-spec still stands.

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

1. **`proposal-feedback` must have NO `forward`.** _(Reversed by OTTER-614: an APPROVED study now
   shows "Proceed to Step 3"; CHANGE-REQUESTED/REJECTED still have no forward.)_ Task 4 gave the
   CHANGE-REQUESTED
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
4. **`study-results` has no back** (already fixed: terminal; `/view` self-loop avoided). _(Reversed
   by OTTER-614: results now has a "Previous" → `/view?step=code`; the `?step=` cap avoids the
   self-loop.)_
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

**Decision: (A), with the integration pattern VERIFIED by probe.** Each `*-screen.tsx` wrapper is
an **async server component** that does its own `await loadCodeReviewFeedback` / `getOrgNameFromId`
/ `countSubmittedJobsForStudy` / `latestSubmittedJobForStudy`, then renders the (sync) legacy leaf
component with props. (The legacy leaf components — `CodePostDecisionView`, `CodePostSubmissionView`,
`StudyDetailsResearcher` — are all SYNC; only the data-loading is async, exactly as in the cascade.)

**Integration pattern (verified):** a probe confirmed RTL/vitest does NOT resolve an async component
rendered as a JSX child (`<AsyncScreen/>`), but DOES render it when the async function is **awaited**
and its resolved element is returned. So:

- `view/page.tsx` dispatch (already in an async function) **awaits the component function directly**:
    ```tsx
    const Screen = SCREEN_COMPONENTS[descriptor.screen]
    return await Screen({ descriptor, study, raw, orgSlug, dashboardHref })
    ```
    NOT `return <Screen {...props}/>` (that JSX-child form leaves the async wrapper unresolved in the
    test harness).
- Consequently the `StudyScreenRenderer` JSX wrapper from Task 13 is **not** the integration point
  for async screens. The page dispatch calls the component function and awaits it. (`StudyScreenRenderer`
  can be removed, or kept only for sync usage; the page no longer needs it.) Update Task 14's dispatch
  block accordingly when the cascade is deleted (Task 15d): it already looks up
  `SCREEN_COMPONENTS[descriptor.screen]` — change `return <RegisteredScreen .../>` to
  `return await RegisteredScreen({ ...props })`.
- `ScreenComponent` type becomes `(props: ScreenComponentProps) => React.ReactNode | Promise<React.ReactNode>`
  to allow async wrappers (or keep `React.ComponentType` and await its call — awaiting a sync return
  is harmless).

The wrappers reuse the SAME helper functions the cascade uses; move `loadCodeReviewFeedback` (today
a local in `page.tsx`) to a shared util (e.g. `view/load-code-review-feedback.ts`) so both the
wrappers and (until deleted) the cascade import it.

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

## Decision log (during execution)

- **`?from=agreements` "proposal on /view" removed (accepted behavior change).** Today
  `?from=agreements` on a code-submitted study showed the read-only proposal on `/view`. Under the
  machine that study resolves to `code-under-review` and `?from=` is ignored. The capability to
  view a submitted study's proposal already lives at **`/submitted`** (`ProposalSubmitted`, shows
  proposal + feedback). So the agreements "Previous" button (Task 15g) targets `/submitted`, and
  the two `view/page.test.tsx` tests asserting the removed `?from=agreements`-shows-proposal-on-`/view`
  behavior are deleted. Same proposal content reachable, cleaner routing, `?from=` gone.

## Decision: latestJob uses the ideal job model (baseline-masking is a write-path bug)

**Decision (user):** The state machine is built on the _intended_ job model: a CHANGE-REQUESTED
resubmission **reuses the existing job** (uploading new files / launching the IDE changes that
job's files) and does **NOT** create a fresh `INITIATED` baseline job. Therefore
`projectStudyState.latestJob()` selecting `max(studyJob.id)` across all jobs is correct — under the
intended model no stray `INITIATED` job exists to mask a decision.

**Consequences:**

- The two `view/page.test.tsx` "baseline-job masking (OTTER-556 refresh dead-end)" tests assert a
  state produced only by the **current write-path bug** (the stray `INITIATED` job that
  `getOrCreateCurrentRoundJob` opens when it treats `CODE-CHANGES-REQUESTED` as a closed round).
  They are **deleted** — they test a state that should not exist under the intended model.
- **WRITE-PATH FOLLOW-UP (out of scope for this branch, REQUIRED before/with shipping):**
  `getOrCreateCurrentRoundJob` / `resubmitStudyCodeAction` / `ensureRoundJobForUpload` currently
  open a new `INITIATED` round job during a CR resubmission (see the OTTER-601 comment in
  `study-request.ts`: "a file upload during resubmit opens a fresh INITIATED round job"). That must
  be changed so CR resubmission reuses the existing job. **Until that write-path fix lands, an
  in-progress CR resubmission can still create a stray baseline job and mis-route on `/view`** (the
  state machine, built on the ideal model, will read the empty baseline as "no code submitted").
  This is an accepted, time-boxed gap: the write-path fix is a required companion change.
- `latestSubmittedJobForStudy`'s `INITIATED`-skip becomes unnecessary under the fixed model; it can
  be retired when the write path is corrected.
