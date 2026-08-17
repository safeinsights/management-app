import type { FileType, StudyJobStatus } from '@/database/types'
import {
    filesIncludeDecryptableErrorLog,
    filesIncludeUndecryptableErrorLog,
    jobHasDecryptableRunOutcome,
} from '@/lib/file-type-helpers'

// OTTER-524: everything we can honestly tell a reviewer about why a run failed.
//
// The hard constraint this module exists to work around: for the two most common failures the
// enclave and the packaging step send NO log. AWS produces no container log stream when a task
// never starts (nothing ran to emit one), and the containerizer's failure webhook carries no log
// either. So "show the error log" is frequently impossible, and the next best thing is to say
// which stage failed and be straight about the absence.

/**
 * How far the job got before it failed. Derived from the status history alone, which is why it
 * works even when no log arrived.
 *
 * The pipeline is JOB-PACKAGING -> JOB-READY -> JOB-PROVISIONING -> JOB-RUNNING, and every stage is
 * recorded, so the absence of a stage is as informative as its presence. Keyed on JOB-READY rather
 * than JOB-RUNNING for the packaging case: JOB-READY is precisely the containerizer reporting
 * success, so its absence means packaging is what failed.
 */
export type JobFailureStage = 'packaging' | 'never-started' | 'run'

export function jobFailureStage(statusChanges: ReadonlyArray<{ status: StudyJobStatus }>): JobFailureStage {
    const statuses = new Set(statusChanges.map((c) => c.status))
    if (statuses.has('JOB-RUNNING')) return 'run'
    if (statuses.has('JOB-READY')) return 'never-started'
    return 'packaging'
}

const STAGE_EXPLANATION: Record<JobFailureStage, string> = {
    packaging: 'The code environment image could not be prepared, so the code never ran.',
    'never-started': 'The code was packaged but never started running in the secure enclave.',
    run: 'The code ran in the secure enclave and did not finish successfully.',
}

export const NO_ERROR_LOG_TEXT = 'There is no error log for this run.'
export const KEY_PROMPT_TEXT = 'Enter your security key below to review the error log.'
// A run that errored after producing results, or one whose only encrypted artifact is something
// other than an error log. There is still a reason to enter a key, just not an error log to read.
export const NO_LOG_WITH_ARTIFACTS_TEXT = `${NO_ERROR_LOG_TEXT} Enter your security key below to review what it did produce.`
// Deliberately neutral about why. The log exists but reaches this screen in a form no key opens, and
// the two ways that happens (an org with no key holders, or a pre-#764 legacy row) would need
// different explanations that neither helps the reviewer nor changes what they can do here.
export const UNDECRYPTABLE_LOG_TEXT = 'An error log was recorded for this run, but it cannot be displayed here.'

/**
 * What the banner may promise about logs, given what the job actually holds.
 *
 * The ordering encodes the invariant the reviewer's screen depends on: the two branches that mention
 * a security key are exactly the two where `jobHasDecryptableRunOutcome` is true, which is the same
 * predicate that decides whether the key form renders. Deriving both from one file list in one place
 * is what stops the banner instructing the reviewer to use a form that is not on the page, or
 * dropping the instruction while the form renders anyway.
 */
function errorLogSentence(files: ReadonlyArray<{ fileType: FileType }>): string {
    if (filesIncludeDecryptableErrorLog(files)) return KEY_PROMPT_TEXT
    if (jobHasDecryptableRunOutcome(files)) return NO_LOG_WITH_ARTIFACTS_TEXT
    if (filesIncludeUndecryptableErrorLog(files)) return UNDECRYPTABLE_LOG_TEXT
    return NO_ERROR_LOG_TEXT
}

/**
 * Failure classes a build service may report alongside JOB-ERRORED (OTTER-524).
 *
 * A stable code, never prose. The management app owns every user-facing sentence, which means copy
 * changes without an infra deploy, and no text written by a build script can reach a reviewer's
 * screen. Adding a code here is what makes it renderable; until then it is dropped.
 */
export const JOB_FAILURE_REASONS = ['BASE_IMAGE_UNAVAILABLE'] as const
export type JobFailureReason = (typeof JOB_FAILURE_REASONS)[number]

export function isKnownFailureReason(value: string | null | undefined): value is JobFailureReason {
    return !!value && (JOB_FAILURE_REASONS as readonly string[]).includes(value)
}

const FAILURE_REASON_EXPLANATION: Record<JobFailureReason, string> = {
    BASE_IMAGE_UNAVAILABLE:
        'The code environment image could not be found or could not be accessed, so the code never ran. Check the image URL on the Code Environments page.',
}

export type JobErrorDetails = {
    /** Plain-language sentence naming the stage that failed. Always present. */
    explanation: string
    /** What can be said about an error log, from "here is how to read it" to "there isn't one". */
    logSentence: string
}

/**
 * Resolves what the reviewer's errored screen should say about a failed run.
 *
 * `recordedReason` is whatever a service stored against the status. It is classified against
 * JOB_FAILURE_REASONS and NEVER rendered as-is: anything unrecognized falls back to the stage
 * sentence. That single rule is what keeps AWS and deployment detail off a screen another
 * organization reads, and it covers every producer at once. The enclave, for instance, writes a raw
 * thrown AWS error into this same column today, and it will never be displayed.
 *
 * Optional so the screen behaves identically before any service sends a code.
 */
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
