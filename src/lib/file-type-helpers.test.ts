import { describe, expect, it } from 'vitest'
import {
    filesIncludeDecryptableErrorLog,
    filesIncludeUndecryptableErrorLog,
    isEncryptedArtifact,
    isLogType,
    jobHasDecryptableRunOutcome,
} from './file-type-helpers'

describe('file-type-helpers result classification', () => {
    it('isEncryptedArtifact matches encrypted results and logs only', () => {
        expect(isEncryptedArtifact('ENCRYPTED-RESULT')).toBe(true)
        expect(isEncryptedArtifact('ENCRYPTED-CODE-RUN-LOG')).toBe(true)
        expect(isEncryptedArtifact('APPROVED-RESULT')).toBe(false)
        expect(isEncryptedArtifact('APPROVED-CODE-RUN-LOG')).toBe(false)
    })

    // OTTER-524: a job carrying only the submission-time security scan log has no artifact
    // explaining a failed run.
    it('filesIncludeDecryptableErrorLog distinguishes an error log from any log', () => {
        expect(filesIncludeDecryptableErrorLog([{ fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' }])).toBe(false)
        expect(filesIncludeDecryptableErrorLog([{ fileType: 'ENCRYPTED-CODE-RUN-LOG' }])).toBe(true)
        expect(filesIncludeDecryptableErrorLog([{ fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG' }])).toBe(true)
        expect(filesIncludeDecryptableErrorLog([])).toBe(false)
        // isLogType answers true for the scan log too, which is the conflation being fixed.
        expect(isLogType('ENCRYPTED-SECURITY-SCAN-LOG')).toBe(true)
    })

    it('filesIncludeUndecryptableErrorLog matches plaintext and legacy error logs', () => {
        expect(filesIncludeUndecryptableErrorLog([{ fileType: 'PACKAGING-ERROR-LOG' }])).toBe(true)
        expect(filesIncludeUndecryptableErrorLog([{ fileType: 'APPROVED-CODE-RUN-LOG' }])).toBe(true)
        expect(filesIncludeUndecryptableErrorLog([{ fileType: 'SECURITY-SCAN-LOG' }])).toBe(false)
        expect(filesIncludeUndecryptableErrorLog([{ fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG' }])).toBe(false)
    })

    it('jobHasDecryptableRunOutcome covers results and error logs but not the scan log', () => {
        expect(jobHasDecryptableRunOutcome([{ fileType: 'ENCRYPTED-RESULT' }])).toBe(true)
        expect(jobHasDecryptableRunOutcome([{ fileType: 'ENCRYPTED-CODE-RUN-LOG' }])).toBe(true)
        expect(jobHasDecryptableRunOutcome([{ fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG' }])).toBe(true)
        expect(jobHasDecryptableRunOutcome([{ fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' }])).toBe(false)
        expect(jobHasDecryptableRunOutcome([{ fileType: 'PACKAGING-ERROR-LOG' }])).toBe(false)
        expect(jobHasDecryptableRunOutcome([])).toBe(false)
        // The predicate it replaced at the key gate answers differently on the reported job.
        expect(isEncryptedArtifact('ENCRYPTED-SECURITY-SCAN-LOG')).toBe(true)
    })
})
