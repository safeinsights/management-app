import type { StudyJobStatus } from '@/database/types'

// OTTER-636: central code-lifecycle predicates, computed from two named status sets so callers never
// confuse "current round" (Draft display) with "reviewed round" (reviewer content). Every code
// submission/route/round-creation gate derives from these — do not implement one as `!another`.
export type CodeRoundStatuses = {
    // Status set of the absolute-latest round (by UUIDv7 id); null when the study has no code rounds.
    latestAbsolute: readonly StudyJobStatus[] | null
    // Status set of the latest round that reached a submission (any non-INITIATED status); null when none.
    latestSubmitted: readonly StudyJobStatus[] | null
}

const has = (set: readonly StudyJobStatus[] | null | undefined, s: StudyJobStatus) => !!set && set.includes(s)

// An open, un-submitted draft round exists when the absolute-latest round carries only INITIATED.
export const hasOpenCodeDraftRound = (s: CodeRoundStatuses): boolean =>
    !!s.latestAbsolute && s.latestAbsolute.length > 0 && s.latestAbsolute.every((st) => st === 'INITIATED')

// The latest submitted round is in a state the researcher may revise from: live changes-requested, a
// bare errored run, or a results decision. Terminal CODE-REJECTED and a normal CODE-APPROVED
// (provisioning/running, no error/results yet) are NOT revision entry states. Exported so the
// round-creation helper (server/db/mutations.ts) opens a fresh draft round on exactly these states.
export const isCodeRevisionEntry = (submitted: readonly StudyJobStatus[]): boolean => {
    if (has(submitted, 'CODE-REJECTED')) return false
    if (has(submitted, 'FILES-APPROVED') || has(submitted, 'FILES-REJECTED')) return true
    if (has(submitted, 'JOB-ERRORED')) return true
    if (has(submitted, 'CODE-CHANGES-REQUESTED')) return true
    return false
}

// Initial code draft: the study has no submitted round yet (first-ever code work). Combine with the
// proposal being APPROVED at the call site.
export const canStartInitialCodeDraft = (s: CodeRoundStatuses): boolean => s.latestSubmitted == null

// Eligible to open/continue a revision draft round over a submitted round in an entry state.
export const canStartCodeRevisionDraft = (s: CodeRoundStatuses): boolean =>
    !!s.latestSubmitted && isCodeRevisionEntry(s.latestSubmitted)

// Positive gate for the INITIAL submission path (/code, no note): valid only while the study has no
// prior submitted round. The submit action itself opens the round if one is not already open, so this
// does not require an open draft round — only that nothing has been submitted yet. Once a round has been
// submitted (even before review), a further submission must use the resubmit-with-note path, so this
// can never overwrite reviewed code or bypass the note (OTTER-636 Finding 6).
export const canSubmitInitialCode = (s: CodeRoundStatuses): boolean => s.latestSubmitted == null

// Positive gate for the RESUBMISSION path (/resubmit, requires a note): the latest submitted round is
// in a revision entry state.
export const canResubmitCode = (s: CodeRoundStatuses): boolean =>
    !!s.latestSubmitted && isCodeRevisionEntry(s.latestSubmitted)

// Reviewer may act on code only when the latest submitted round is awaiting a decision and no open
// draft round is masking it (the researcher's in-progress revision is never actionable by a reviewer).
export const canReviewerReviewCode = (s: CodeRoundStatuses): boolean => {
    if (hasOpenCodeDraftRound(s)) return false
    const submitted = s.latestSubmitted
    if (!submitted) return false
    const submittedCount = submitted.filter((st) => st === 'CODE-SUBMITTED').length
    const decisionCount = submitted.filter(
        (st) => st === 'CODE-APPROVED' || st === 'CODE-REJECTED' || st === 'CODE-CHANGES-REQUESTED',
    ).length
    return submittedCount > 0 && decisionCount < submittedCount
}
