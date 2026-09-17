import type { FileType, ReviewDecision, StudyJobStatus } from '@/database/types'
import { overCharacterLimitError } from '@/lib/field-limits'
import { ENCRYPTED_LOG_TYPES } from '@/lib/file-type-helpers'
import { ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

export type OutputsDecision = 'share-outputs' | 'share-feedback-only'

export const OUTPUTS_DECISIONS: readonly OutputsDecision[] = ['share-outputs', 'share-feedback-only']

// Withholding the files invites a resubmission, so it is NEEDS-CLARIFICATION, not the terminal
// REJECT.
const OUTPUTS_DECISION_TO_REVIEW: Record<OutputsDecision, ReviewDecision> = {
    'share-outputs': 'APPROVE',
    'share-feedback-only': 'NEEDS-CLARIFICATION',
}

export const toOutputsReviewDecision = (decision: OutputsDecision): ReviewDecision =>
    OUTPUTS_DECISION_TO_REVIEW[decision]

export const OUTPUTS_FEEDBACK_MAX_CHARACTERS = 1800

export const OUTPUTS_FEEDBACK_FIELD_TITLE = 'Decision'

// STUDY_RESULTS_JOB_STATUSES minus the round-closing pair, spelled out because the two-element
// list reads clearer than the subtraction.
export const OUTPUTS_REVIEWABLE_JOB_STATUSES: readonly StudyJobStatus[] = ['JOB-ERRORED', 'RUN-COMPLETE']

// Takes plain strings because callers' select shapes widen the status type.
const includesStatus = (jobStatuses: readonly string[], wanted: readonly StudyJobStatus[]) =>
    jobStatuses.some((status) => (wanted as readonly string[]).includes(status))

export const hasReviewableOutputs = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, OUTPUTS_REVIEWABLE_JOB_STATUSES)

// Closing the round and deciding the files are the same event, so this reuses
// ROUND_CLOSING_JOB_STATUSES rather than restating the pair.
export const hasOutputsDecision = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, ROUND_CLOSING_JOB_STATUSES)

// True while this job can still take a decision. Reads every status row of the job, the same test
// the decision action applies, rather than the newest row: an asynchronous CODE-SCANNED can land
// after FILES-APPROVED and would otherwise hide the decision. The study status says nothing here,
// because it stays APPROVED for the whole outputs round.
export const isOutputsReviewEditable = ({ jobStatuses }: { jobStatuses: readonly string[] }): boolean =>
    !hasOutputsDecision(jobStatuses)

// Carried by both paths that close the round, so a reviewer whose own submit lost the race and who
// also receives the winner's event is told once rather than twice (OTTER-726).
export const OUTPUTS_DECIDED_NOTIFICATION_ID = 'outputs-decision-closed'

// Shown to every tab that finds the decision by asking rather than by receiving the live event,
// where there is no reviewer to name.
export const OUTPUTS_DECIDED_NOTICE = {
    id: OUTPUTS_DECIDED_NOTIFICATION_ID,
    title: 'Decision submitted',
    message: 'A decision has been submitted for this output. No further edits are allowed at this point.',
} as const

export const OUTPUTS_DECISION_FAILURE = {
    title: 'Decision could not be submitted',
    saved: 'Your work is saved. Try again.',
    // Never promises the work is safe: without a collaborative session the feedback is only on screen.
    unsaved: 'We could not save your work. Keep this tab open and try again.',
    // A retry cannot succeed until the page loads the build now serving, and that costs the key.
    staleSaved: 'Your work is saved. Reload the page and try again. You will be asked for your security key again.',
    staleUnsaved:
        'Reload the page and try again. You will be asked for your security key again, so copy your feedback somewhere safe first.',
} as const

export const OUTPUTS_FILE_NAME_MAX_LENGTH = 50

export type OutputFileOrder = { fileType: FileType; name: string }

// Non-logs rank last, so the logs keep the top of the list.
const logRank = (fileType: FileType): number => {
    const index = ENCRYPTED_LOG_TYPES.indexOf(fileType)
    return index === -1 ? ENCRYPTED_LOG_TYPES.length : index
}

/**
 * Logs first, in ENCRYPTED_LOG_TYPES order, then the results by name. Nothing ordered the rows
 * before this, so the list came back in physical database order and moved between rounds; the logs
 * are context for the results rather than results themselves, so they stay above them (OTTER-758).
 */
export const compareOutputFiles = (a: OutputFileOrder, b: OutputFileOrder): number =>
    logRank(a.fileType) - logRank(b.fileType) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

export const OUTPUTS_DECISION_ERRORS = {
    feedbackEmpty: (labName: string) => `Enter your feedback for ${labName} before submitting.`,
    feedbackTooLong: overCharacterLimitError(OUTPUTS_FEEDBACK_FIELD_TITLE, OUTPUTS_FEEDBACK_MAX_CHARACTERS),
    decisionMissing: 'Select an option before submitting',
} as const
