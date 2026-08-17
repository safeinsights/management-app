import { describe, expect, it } from 'vitest'
import type { FileType, StudyJobStatus } from '@/database/types'
import { jobHasDecryptableRunOutcome } from './file-type-helpers'
import {
    jobErrorDetails,
    jobFailureStage,
    KEY_PROMPT_TEXT,
    NO_ERROR_LOG_TEXT,
    NO_LOG_WITH_ARTIFACTS_TEXT,
    UNDECRYPTABLE_LOG_TEXT,
} from './job-error-details'

const at = (status: StudyJobStatus) => ({ status })
const files = (...fileTypes: FileType[]) => fileTypes.map((fileType) => ({ fileType }))

describe('jobFailureStage', () => {
    // JOB-READY is the containerizer reporting success, so its absence is what identifies a
    // packaging failure. This is the case OTTER-524 was reported for.
    it('reads a missing JOB-READY as a packaging failure', () => {
        expect(jobFailureStage([at('CODE-APPROVED'), at('JOB-PACKAGING'), at('JOB-ERRORED')])).toBe('packaging')
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

    it('prefers the decryptable log when both halves of the same log were stored', () => {
        const details = jobErrorDetails(packagingFailure, files('PACKAGING-ERROR-LOG', 'ENCRYPTED-PACKAGING-ERROR-LOG'))

        expect(details.logSentence).toBe(KEY_PROMPT_TEXT)
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
})
