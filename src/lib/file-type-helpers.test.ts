import { describe, expect, it } from 'vitest'
import {
    filesIncludeErrorLog,
    isEncryptedArtifact,
    isErrorLogType,
    isLegacyResultArtifact,
    isLogType,
    jobHasEncryptedArtifacts,
    jobHasLegacyResults,
} from './file-type-helpers'

describe('file-type-helpers result classification', () => {
    it('isEncryptedArtifact matches encrypted results and logs only', () => {
        expect(isEncryptedArtifact('ENCRYPTED-RESULT')).toBe(true)
        expect(isEncryptedArtifact('ENCRYPTED-CODE-RUN-LOG')).toBe(true)
        expect(isEncryptedArtifact('APPROVED-RESULT')).toBe(false)
        expect(isEncryptedArtifact('APPROVED-CODE-RUN-LOG')).toBe(false)
    })

    it('isLegacyResultArtifact matches plaintext approved results and logs', () => {
        expect(isLegacyResultArtifact('APPROVED-RESULT')).toBe(true)
        expect(isLegacyResultArtifact('APPROVED-SECURITY-SCAN-LOG')).toBe(true)
        expect(isLegacyResultArtifact('SECURITY-SCAN-LOG')).toBe(true)
        expect(isLegacyResultArtifact('ENCRYPTED-RESULT')).toBe(false)
    })

    it('jobHasEncryptedArtifacts is true when any encrypted artifact is present', () => {
        expect(jobHasEncryptedArtifacts([{ fileType: 'ENCRYPTED-RESULT' }])).toBe(true)
        expect(jobHasEncryptedArtifacts([{ fileType: 'APPROVED-RESULT' }])).toBe(false)
        expect(jobHasEncryptedArtifacts([])).toBe(false)
    })

    it('jobHasLegacyResults is true only for legacy artifacts with no encrypted ones', () => {
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-RESULT' }])).toBe(true)
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-CODE-RUN-LOG' }])).toBe(true)
        // both present → not legacy (stay on encrypted path)
        expect(jobHasLegacyResults([{ fileType: 'APPROVED-RESULT' }, { fileType: 'ENCRYPTED-RESULT' }])).toBe(false)
        // encrypted only → not legacy
        expect(jobHasLegacyResults([{ fileType: 'ENCRYPTED-RESULT' }])).toBe(false)
        // no result artifacts at all → not legacy
        expect(jobHasLegacyResults([{ fileType: 'MAIN-CODE' }])).toBe(false)
    })

    // OTTER-524: the distinction the reviewer's errored screen depends on. A job carrying only the
    // security scan log from submission has no artifact that explains a failed run.
    it('isErrorLogType excludes security scan logs', () => {
        expect(isErrorLogType('ENCRYPTED-PACKAGING-ERROR-LOG')).toBe(true)
        expect(isErrorLogType('ENCRYPTED-CODE-RUN-LOG')).toBe(true)
        expect(isErrorLogType('APPROVED-PACKAGING-ERROR-LOG')).toBe(true)
        expect(isErrorLogType('PACKAGING-ERROR-LOG')).toBe(true)
        expect(isErrorLogType('ENCRYPTED-SECURITY-SCAN-LOG')).toBe(false)
        expect(isErrorLogType('SECURITY-SCAN-LOG')).toBe(false)
        expect(isErrorLogType('ENCRYPTED-RESULT')).toBe(false)
    })

    it('filesIncludeErrorLog distinguishes an error log from any log', () => {
        // The exact shape of the reported bug: an errored job whose only log is the scan log.
        expect(filesIncludeErrorLog([{ fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' }])).toBe(false)
        expect(
            filesIncludeErrorLog([{ fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' }, { fileType: 'ENCRYPTED-CODE-RUN-LOG' }]),
        ).toBe(true)
        expect(filesIncludeErrorLog([])).toBe(false)
        // isLogType would answer true for all three above, which is the conflation being fixed.
        expect(isLogType('ENCRYPTED-SECURITY-SCAN-LOG')).toBe(true)
    })
})
