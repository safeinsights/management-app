# Job Round-Boundary Fix — Sub-Spec

**Date:** 2026-06-22
**Parent:** the study-screen-state-machine work (this fix unblocks `projectStudyState.latestJob`).
**Status:** Draft for review.

## The bug

`getOrCreateCurrentRoundJob` (`mutations.ts`) decides "is the current round closed → create a NEW
`studyJob` on the next work?" by checking whether the latest job has any status in
`CODE_RESUBMITTABLE_JOB_STATUSES` = `{ CODE-CHANGES-REQUESTED, FILES-APPROVED, FILES-REJECTED,
JOB-ERRORED, RUN-COMPLETE }`.

That set is **wrong for the round-boundary question** because it conflates two different concepts:

1. **"May the researcher resubmit code?"** (eligibility gate — `canResubmitStudyCode`).
2. **"Should the next work open a new job?"** (round boundary — `getOrCreateCurrentRoundJob`).

`CODE-CHANGES-REQUESTED` belongs to (1) but NOT (2): a change-requested study is revised **in the
same job** (overwrite files, append a new `CODE-SUBMITTED`). Because the current code puts it in the
round-boundary check, a change-requested resubmission **mints a stray `INITIATED` job**, which then
masks the prior round's decision on the read side — the dead-end the state machine kept tripping over.

## The correct job lifecycle (confirmed with the product owner)

A study's statuses sit at two stages of a round:

- **Pre-run (manual code review):** `CODE-SUBMITTED` → `CODE-SCANNED` → reviewer decides:
    - `CODE-APPROVED` → code runs.
    - `CODE-CHANGES-REQUESTED` → researcher revises **in the same job** (no new job).
    - `CODE-REJECTED` → **terminal**, study is dead (a new study/proposal is required; no resubmit).
- **Run:** `JOB-PROVISIONING/PACKAGING/READY/RUNNING` → `RUN-COMPLETE` (or `JOB-ERRORED`).
- **Post-run (results/files review):** reviewer decides on the produced files (incl. logs):
    - `FILES-APPROVED` → results accepted & shared; the round is **closed**.
    - `FILES-REJECTED` → results rejected; the round is **closed**.

**A new `studyJob` is created on the next work ONLY after a post-run results decision —
`FILES-APPROVED` or `FILES-REJECTED`.** Everything earlier reuses the current job.

Notably:

- `JOB-ERRORED` does **not** itself open a new job. Even though the run failed, the researcher cannot
  start fresh until the reviewer reviews the files/logs and records `FILES-APPROVED`/`FILES-REJECTED`.
  So an errored job is held/reused until that results decision.
- `CODE-CHANGES-REQUESTED` reuses the job (pre-run revision).
- After `FILES-APPROVED`, the researcher **can** start another round (a new job is created).

So the **round-boundary set** ("create a new job on next work") is exactly:

```
ROUND_CLOSING_JOB_STATUSES = { FILES-APPROVED, FILES-REJECTED }
```

This is DIFFERENT from `CODE_RESUBMITTABLE_JOB_STATUSES` (the resubmit-eligibility gate), which is
unchanged.

## Changes

### 1. New constant (`src/lib/code-resubmission.ts` or a new `job-rounds.ts`)

```ts
// A round CLOSES — and the next IDE launch / upload / submit opens a NEW studyJob — only after a
// post-run results decision. Pre-run outcomes (CODE-CHANGES-REQUESTED) and a not-yet-reviewed run
// (JOB-ERRORED awaiting files review) revise/continue the SAME job. CODE-REJECTED is terminal.
export const ROUND_CLOSING_JOB_STATUSES = [
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const satisfies readonly StudyJobStatus[]
```

### 2. `getOrCreateCurrentRoundJob` (`mutations.ts`)

Change the `roundClosed` existence check from `CODE_RESUBMITTABLE_JOB_STATUSES` to
`ROUND_CLOSING_JOB_STATUSES`. (Keep the existence-check / order-independence structure exactly as is —
only the status set changes.)

The comment that says "A resubmittable/terminal status is never followed by another status on the
same job (resubmit opens a NEW job)" must be updated: it's now "a ROUND-CLOSING status
(FILES-APPROVED/FILES-REJECTED) is never followed by another status on the same job."

### 3. Version numbering — `countSubmittedJobsForStudy` (`queries.ts`)

Today `submissionVersion` = number of JOBS with `CODE-SUBMITTED`. Under reuse, a CR resubmission
appends a 2nd `CODE-SUBMITTED` to the SAME job, so counting jobs would wrongly stay "v1". Change the
semantics to **count `CODE-SUBMITTED` occurrences** (the number of submission attempts), so a
reused-job resubmission reads "v2".

- Rename/repurpose to `countCodeSubmissions(studyId)` returning the count of `CODE-SUBMITTED` status
  rows for the study (across jobs — or on the latest job; **DECISION NEEDED**, see open questions).
- Update its one caller (`code-under-review-screen.tsx`) accordingly.

### 4. Submit-enable (`workspaces.actions.ts`) — NO CHANGE NEEDED

It already anchors on the last `CODE-SUBMITTED` moment (not job `createdAt`), so it is already robust
to job reuse. Confirm with its existing test.

### 5. `projectStudyState.latestJob` (`state.ts`) — NO CHANGE NEEDED

Under the fixed write path, no stray `INITIATED` baseline job exists, so `max(id)` across all jobs is
correct. (The `latestJob` stays as-is; the fix is upstream in job creation.)

### 6. Tests

- The `getOrCreateCurrentRoundJob` tests (`mutations.test.ts`) must be updated: a
  `CODE-CHANGES-REQUESTED` study's next work now REUSES the job (was: created new). Add a test that
  `FILES-APPROVED`/`FILES-REJECTED` DO open a new job, and that `CODE-CHANGES-REQUESTED`/`JOB-ERRORED`
  do NOT.
- The two `view/page.test.tsx` "baseline-job masking (OTTER-556)" tests: under the fixed model the
  stray baseline job can't be created by the app, BUT the tests insert it manually via
  `insertTestBaselineJob`. Decision: rewrite them to NOT manufacture an impossible state (or delete
  them), since the masking they defend against no longer occurs. (They currently fail because the SM
  reads the manufactured baseline.)
- Resubmission-version tests: verify "v2" still shows for a CR resubmission under the new
  count-by-CODE-SUBMITTED logic.

## Decisions (confirmed)

1. **Version count scope: PER CURRENT JOB.** `submissionVersion` = count of `CODE-SUBMITTED`
   occurrences on the **latest job only**. A same-job CR revision appends a 2nd `CODE-SUBMITTED` →
   v2. A new round (new job after `FILES-APPROVED`/`FILES-REJECTED`) starts back at **v1**. So
   `countSubmittedJobsForStudy` becomes "count CODE-SUBMITTED on the latest job."
2. **`canResubmitStudyCode` / resubmit eligibility:** unchanged by this fix (still gates on
   `CODE_RESUBMITTABLE_JOB_STATUSES`). `CODE-REJECTED` stays excluded (terminal); the post-run states
   stay included.
3. **Sequencing: land on THIS branch now**, as discrete reviewed commits. It unblocks the cascade
   deletion (15d). Order: (a) revert the currently-red cascade-deletion commit to restore green,
   (b) implement this round-boundary fix + its tests, (c) re-do the cascade deletion (now green
   because jobs are created correctly and all screens are wired).

## Out of scope

- Any change to the reviewer flow or the meaning of the statuses themselves.
- `CODE_RESUBMITTABLE_JOB_STATUSES` (the eligibility gate) stays as-is.
