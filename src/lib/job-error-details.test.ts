import { describe, expect, it } from 'vitest'
import type { FileType, StudyJobStatus } from '@/database/types'
import { jobHasDecryptableRunOutcome } from './file-type-helpers'
import {
    isKnownFailureReason,
    jobErrorDetails,
    jobFailureStage,
    KEY_PROMPT_TEXT,
    NO_ERROR_LOG_TEXT,
    NO_LOG_WITH_ARTIFACTS_TEXT,
    UNDECRYPTABLE_LOG_TEXT,
    UNDECRYPTABLE_LOG_WITH_ARTIFACTS_TEXT,
} from './job-error-details'

const at = (status: StudyJobStatus) => ({ status })
const files = (...fileTypes: FileType[]) => fileTypes.map((fileType) => ({ fileType }))

describe('jobFailureStage', () => {
    // JOB-READY is the containerizer reporting success, so its absence is what identifies a
    // packaging failure. This is the case OTTER-524 was reported for.
    it('reads a missing JOB-READY as a packaging failure', () => {
        expect(jobFailureStage([at('CODE-APPROVED'), at('JOB-PACKAGING'), at('JOB-ERRORED')])).toBe('packaging')
    })

    // The scan webhook and /api/job/[jobId] both accept JOB-ERRORED, so a job can error before the
    // containerizer ever posts JOB-PACKAGING. Blaming the image would name a step that never ran.
    it('names no stage when the job errored before packaging started', () => {
        expect(jobFailureStage([at('CODE-SUBMITTED'), at('JOB-ERRORED')])).toBe('unknown')
    })

    it('reads JOB-READY without JOB-RUNNING as never started', () => {
        expect(jobFailureStage([at('JOB-PACKAGING'), at('JOB-READY'), at('JOB-PROVISIONING'), at('JOB-ERRORED')])).toBe(
            'never-started',
        )
    })

    it('reads JOB-RUNNING as a failure during the run', () => {
        expect(jobFailureStage([at('JOB-READY'), at('JOB-RUNNING'), at('JOB-ERRORED')])).toBe('run')
    })

    // Order is not significant: statusChanges arrives desc from one query and unsorted from another.
    it('does not depend on the order of the status history', () => {
        const changes = [at('JOB-ERRORED'), at('JOB-RUNNING'), at('JOB-READY')]
        expect(jobFailureStage(changes)).toBe('run')
        expect(jobFailureStage([...changes].reverse())).toBe('run')
    })
})

describe('jobErrorDetails', () => {
    const packagingFailure = [at('JOB-PACKAGING'), at('JOB-ERRORED')]

    it('explains the stage even when nothing else is known', () => {
        const details = jobErrorDetails(packagingFailure, [])

        expect(details.explanation).toContain('could not be prepared')
        expect(details.logSentence).toBe(NO_ERROR_LOG_TEXT)
    })

    it('reports a run-stage failure differently from a packaging failure', () => {
        const ran = jobErrorDetails([at('JOB-RUNNING'), at('JOB-ERRORED')], [])

        expect(ran.explanation).not.toBe(jobErrorDetails(packagingFailure, []).explanation)
    })

    it('points the reviewer at their key when a decryptable error log exists', () => {
        const details = jobErrorDetails(packagingFailure, files('ENCRYPTED-PACKAGING-ERROR-LOG'))

        expect(details.logSentence).toBe(KEY_PROMPT_TEXT)
    })

    // The reported job: the source scan succeeded so a scan log exists, packaging then failed and
    // produced nothing. The scan log is not an error log, and nothing here is worth a key.
    it('treats a security-scan-log-only job as having nothing to open', () => {
        const details = jobErrorDetails(packagingFailure, files('ENCRYPTED-SECURITY-SCAN-LOG'))

        expect(details.logSentence).toBe(NO_ERROR_LOG_TEXT)
    })

    // A run that errored after producing results. No error log to read, but the results still need a
    // key, so the sentence has to carry both facts without contradicting either.
    it('states both the missing log and the key step when results exist', () => {
        const details = jobErrorDetails([at('JOB-RUNNING'), at('JOB-ERRORED')], files('ENCRYPTED-RESULT'))

        expect(details.logSentence).toBe(NO_LOG_WITH_ARTIFACTS_TEXT)
        expect(details.logSentence).toContain('no error log')
        expect(details.logSentence).toContain('security key')
    })

    // encryptAndStoreLog returns null when the org has no key holders, and the route then stores the
    // plaintext log on its own. Claiming there is no log would be false; promising a key form would
    // send the reviewer to a form that is not rendered.
    it('does not deny a plaintext error log, nor promise a key that cannot open it', () => {
        const details = jobErrorDetails(packagingFailure, files('PACKAGING-ERROR-LOG'))

        expect(details.logSentence).toBe(UNDECRYPTABLE_LOG_TEXT)
        expect(details.logSentence).not.toContain('security key')
    })

    // A key holder registering between the log write and the results write leaves the job holding
    // both. Reaching for the results sentence alone would deny a log that is sitting right there.
    it('does not deny a plaintext log just because the run also produced results', () => {
        const details = jobErrorDetails(
            [at('JOB-RUNNING'), at('JOB-ERRORED')],
            files('ENCRYPTED-RESULT', 'PACKAGING-ERROR-LOG'),
        )

        expect(details.logSentence).toBe(UNDECRYPTABLE_LOG_WITH_ARTIFACTS_TEXT)
        expect(details.logSentence).not.toContain('no error log')
        expect(details.logSentence).toContain('security key')
    })

    it('says nothing about the failed stage it cannot identify', () => {
        const details = jobErrorDetails([at('CODE-SUBMITTED'), at('JOB-ERRORED')], [])

        expect(details.explanation).not.toContain('code environment image')
        expect(details.explanation).toBe('This run did not complete successfully.')
    })

    it('prefers the decryptable log when both halves of the same log were stored', () => {
        const details = jobErrorDetails(packagingFailure, files('PACKAGING-ERROR-LOG', 'ENCRYPTED-PACKAGING-ERROR-LOG'))

        expect(details.logSentence).toBe(KEY_PROMPT_TEXT)
    })
})

// OTTER-524: the reviewer may see only sentences this app authored. Everything a service recorded is
// classified first, so no AWS or deployment detail can reach a screen another organization reads.
describe('recorded failure reasons', () => {
    const packagingFailure = [at('JOB-PACKAGING'), at('JOB-ERRORED')]

    it('explains a known failure class in our own words', () => {
        const details = jobErrorDetails(packagingFailure, [], 'BASE_IMAGE_UNAVAILABLE')

        expect(details.explanation).toContain('could not be found or could not be accessed')
        expect(details.explanation).toContain('Code Environments page')
    })

    it('falls back to the stage sentence when no reason was recorded', () => {
        expect(jobErrorDetails(packagingFailure, [], null).explanation).toBe(
            jobErrorDetails(packagingFailure, []).explanation,
        )
    })

    // A containerizer deploy can introduce a code before this app knows it. Unknown means silent.
    it('drops an unrecognized code rather than showing it', () => {
        const details = jobErrorDetails(packagingFailure, [], 'SOMETHING_WE_DO_NOT_KNOW')

        expect(details.explanation).not.toContain('SOMETHING_WE_DO_NOT_KNOW')
        expect(details.explanation).toBe(jobErrorDetails(packagingFailure, []).explanation)
    })

    // The enclave writes a raw thrown AWS error into this same column today. This is the guard that
    // stops bucket names, ARNs, and account ids reaching the screen from any producer.
    it.each([
        'Command "aws s3 sync s3://si-prod-bucket/studies/x/y/jobs/z/code" exited with code 1',
        'User: arn:aws:sts::123456789012:assumed-role/MgmntAppContainerizer/abc is not authorized',
        'CannotPullContainerError: ref pull has been retried 5 time(s)',
    ])('never renders raw service text: %s', (raw) => {
        const details = jobErrorDetails(packagingFailure, [], raw)

        expect(details.explanation).toBe(jobErrorDetails(packagingFailure, []).explanation)
        expect(details.explanation + details.logSentence).not.toContain(raw)
    })

    it('classifies only the codes it declares', () => {
        expect(isKnownFailureReason('BASE_IMAGE_UNAVAILABLE')).toBe(true)
        expect(isKnownFailureReason('base_image_unavailable')).toBe(false)
        expect(isKnownFailureReason('')).toBe(false)
        expect(isKnownFailureReason(null)).toBe(false)
        expect(isKnownFailureReason(undefined)).toBe(false)
    })
})

// The invariant the whole fix rests on: the banner mentions a security key in exactly the cases where
// the panel renders the key form, which it gates on jobHasDecryptableRunOutcome over the same files.
// Asserted over every combination rather than trusting a reading of the two call sites.
describe('banner and key gate agree', () => {
    const CANDIDATES: FileType[] = [
        'ENCRYPTED-RESULT',
        'ENCRYPTED-CODE-RUN-LOG',
        'ENCRYPTED-PACKAGING-ERROR-LOG',
        'ENCRYPTED-SECURITY-SCAN-LOG',
        'PACKAGING-ERROR-LOG',
        'SECURITY-SCAN-LOG',
        'MAIN-CODE',
    ]

    const combinations = (types: FileType[]): FileType[][] =>
        types.reduce<FileType[][]>((acc, type) => [...acc, ...acc.map((combo) => [...combo, type])], [[]])

    it.each(combinations(CANDIDATES).map((combo) => [combo.join(', ') || '(no files)', combo] as const))(
        'promises a key only when one is required: %s',
        (_label, combo) => {
            const jobFiles = files(...combo)
            const { logSentence } = jobErrorDetails([at('JOB-ERRORED')], jobFiles)

            expect(logSentence.includes('security key')).toBe(jobHasDecryptableRunOutcome(jobFiles))
        },
    )

    // The other half of the same honesty rule: whatever else the job holds, the banner never denies a
    // log the job is carrying. Asserted over the same combinations for the same reason.
    it.each(combinations(CANDIDATES).map((combo) => [combo.join(', ') || '(no files)', combo] as const))(
        'never denies a log the job holds: %s',
        (_label, combo) => {
            const jobFiles = files(...combo)
            const { logSentence } = jobErrorDetails([at('JOB-ERRORED')], jobFiles)
            const hasErrorLog = combo.some((type) => type.includes('PACKAGING-ERROR-LOG') || type.includes('RUN-LOG'))

            expect(logSentence.includes('no error log') && hasErrorLog).toBe(false)
        },
    )
})
