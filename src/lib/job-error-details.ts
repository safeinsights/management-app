import type { FileType, StudyJobStatus } from '@/database/types'
import {
    filesIncludeDecryptableErrorLog,
    filesIncludeUndecryptableErrorLog,
    jobHasDecryptableRunOutcome,
} from '@/lib/file-type-helpers'
import { hasJobStatus } from '@/lib/study-job-status'

// OTTER-524: for the two most common failures no log exists at all — AWS emits no log stream for
// a task that never starts, and the containerizer's failure webhook carries none — so this module
// names the stage that failed instead.

export type JobFailureStage = 'packaging' | 'never-started' | 'run' | 'unknown'

export function jobFailureStage(statusChanges: ReadonlyArray<{ status: StudyJobStatus }>): JobFailureStage {
    if (hasJobStatus(statusChanges, ['JOB-RUNNING'])) return 'run'
    if (hasJobStatus(statusChanges, ['JOB-READY'])) return 'never-started'
    if (hasJobStatus(statusChanges, ['JOB-PACKAGING'])) return 'packaging'
    return 'unknown'
}

const STAGE_EXPLANATION: Record<JobFailureStage, string> = {
    packaging: 'The code environment image could not be prepared, so the code never ran.',
    'never-started': 'The code was packaged but never started running in the secure enclave.',
    run: 'The code ran in the secure enclave and did not finish successfully.',
    unknown: 'This run did not complete successfully.',
}

export const NO_ERROR_LOG_TEXT = 'There is no error log for this run.'
export const KEY_PROMPT_TEXT = 'Enter your security key below to review the error log.'
export const NO_LOG_WITH_ARTIFACTS_TEXT = `${NO_ERROR_LOG_TEXT} Enter your security key below to review what it did produce.`
// Neutral about why: the two causes (no key holders, or a pre-#764 legacy row) would need
// different explanations that neither help the reviewer nor change what they can do here.
export const UNDECRYPTABLE_LOG_TEXT = 'An error log was recorded for this run, but it cannot be displayed here.'
export const UNDECRYPTABLE_LOG_WITH_ARTIFACTS_TEXT = `${UNDECRYPTABLE_LOG_TEXT} Enter your security key below to review what it did produce.`

// The branches mentioning a security key are exactly those where `jobHasDecryptableRunOutcome`
// is true, the same predicate that decides whether the key form renders.
function errorLogSentence(files: ReadonlyArray<{ fileType: FileType }>): string {
    if (filesIncludeDecryptableErrorLog(files)) return KEY_PROMPT_TEXT
    // A job can hold both a results artifact and a log no key opens, so the log check must sit
    // inside this branch rather than after it.
    if (jobHasDecryptableRunOutcome(files)) {
        return filesIncludeUndecryptableErrorLog(files)
            ? UNDECRYPTABLE_LOG_WITH_ARTIFACTS_TEXT
            : NO_LOG_WITH_ARTIFACTS_TEXT
    }
    if (filesIncludeUndecryptableErrorLog(files)) return UNDECRYPTABLE_LOG_TEXT
    return NO_ERROR_LOG_TEXT
}

// Codes, never prose, so no build-script text reaches a reviewer's screen (OTTER-524).
// TODO(OTTER-524): trusted by value, not by source — any producer that knows a code here can have
// it read back as a containerizer classification. Needs its own column before a code carries a
// sentence a reviewer would act on.
export const JOB_FAILURE_REASONS = ['BASE_IMAGE_UNAVAILABLE'] as const
export type JobFailureReason = (typeof JOB_FAILURE_REASONS)[number]

export function isKnownFailureReason(value: string | null | undefined): value is JobFailureReason {
    return !!value && (JOB_FAILURE_REASONS as readonly string[]).includes(value)
}

// Names who can act rather than instructing the reader: the Code Environments page is org-admin
// only, so most reviewers cannot carry out "check the image URL".
const FAILURE_REASON_EXPLANATION: Record<JobFailureReason, string> = {
    BASE_IMAGE_UNAVAILABLE:
        'The code environment image could not be found or could not be accessed, so the code never ran. An organization administrator can check the image URL on the Code Environments page.',
}

export type JobErrorDetails = {
    explanation: string
    logSentence: string
}

// `recordedReason` is never rendered as-is; anything unrecognized falls back to the stage
// sentence, keeping AWS and deployment detail off a screen another organization reads.
export function jobErrorDetails(
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>,
    files: ReadonlyArray<{ fileType: FileType }>,
    recordedReason: string | null = null,
): JobErrorDetails {
    return {
        explanation: isKnownFailureReason(recordedReason)
            ? FAILURE_REASON_EXPLANATION[recordedReason]
            : STAGE_EXPLANATION[jobFailureStage(statusChanges)],
        logSentence: errorLogSentence(files),
    }
}
