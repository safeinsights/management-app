import type { StudyJobStatus } from '@/database/types'

// OTTER-524: everything we can honestly tell a reviewer about why a run failed.
//
// The hard constraint this module exists to work around: for the two most common failures the
// enclave and the packaging step send NO log. AWS produces no container log stream when a task
// never starts (nothing ran to emit one), and the containerizer's failure webhook carries no log
// either. So "show the error log" is frequently impossible, and the next best thing is to say
// which stage failed and pass along whatever short reason did arrive.

export type StatusChangeDetail = {
    status: StudyJobStatus
    message?: string | null
    createdAt?: Date | string
}

/**
 * How far the job got before it failed. Derived from the status history alone, which is why it
 * works even when no log or message arrived.
 *
 * The pipeline is JOB-PACKAGING -> JOB-READY -> JOB-PROVISIONING -> JOB-RUNNING, and every stage is
 * recorded, so the absence of a stage is as informative as its presence. Keyed on JOB-READY rather
 * than JOB-RUNNING for the packaging case: JOB-READY is precisely the containerizer reporting
 * success, so its absence means packaging is what failed.
 */
export type JobFailureStage = 'packaging' | 'never-started' | 'run'

export function jobFailureStage(statusChanges: ReadonlyArray<StatusChangeDetail>): JobFailureStage {
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

/**
 * The most recent reason recorded against a status, or null. Selected by recency rather than array
 * position because statusChanges ordering differs per query (see latestStatusAt), and a retried
 * delivery can append a second row for the same status.
 */
export function latestStatusMessage(
    statusChanges: ReadonlyArray<StatusChangeDetail>,
    status: StudyJobStatus,
): string | null {
    const withMessage = statusChanges.filter((c) => c.status === status && !!c.message?.trim())
    if (withMessage.length === 0) return null
    const latest = withMessage.reduce((a, b) => {
        if (!a.createdAt || !b.createdAt) return b
        return new Date(b.createdAt) > new Date(a.createdAt) ? b : a
    })
    return latest.message?.trim() ?? null
}

export type JobErrorDetails = {
    /** Plain-language sentence naming the stage that failed. Always present. */
    explanation: string
    /** Short reason recorded by whichever service reported the failure, if any. */
    detail: string | null
    /** True when there is genuinely nothing to decrypt, so the copy must not promise a log. */
    hasErrorLog: boolean
}

/**
 * Resolves what the reviewer's errored screen should say. Leads with the derived explanation and
 * demotes the recorded reason to supporting detail: the reason is written by a service (registry
 * errors, ECS stop reasons) and is useful to the data partner who configured the image, but it is
 * not a sentence to open with.
 */
export function jobErrorDetails(
    statusChanges: ReadonlyArray<StatusChangeDetail>,
    { hasErrorLog }: { hasErrorLog: boolean },
): JobErrorDetails {
    return {
        explanation: STAGE_EXPLANATION[jobFailureStage(statusChanges)],
        detail: latestStatusMessage(statusChanges, 'JOB-ERRORED'),
        hasErrorLog,
    }
}

/**
 * The `message` the management app attaches to the containerizer's failure payload. States only the
 * image the build was pointed at, never a cause: this string is fixed when the build is triggered,
 * but the build can fail at source sync, registry auth, resolving this image, or pushing the
 * result. Naming a cause here would misattribute three failures out of four.
 */
export function packagingFailureMessage(codeEnvURL: string): string {
    return `base image: ${codeEnvURL}`
}
