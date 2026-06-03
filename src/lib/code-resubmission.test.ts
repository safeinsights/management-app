import { describe, it, expect } from 'vitest'
import { canResubmitStudyCode } from './code-resubmission'

describe('canResubmitStudyCode', () => {
    it('allows resubmission only for CODE-CHANGES-REQUESTED among code decisions', () => {
        expect(canResubmitStudyCode('CODE-CHANGES-REQUESTED')).toBe(true)
        // CODE-REJECTED is terminal: a rejected study allows no resubmission, only a new proposal.
        expect(canResubmitStudyCode('CODE-REJECTED')).toBe(false)
        expect(canResubmitStudyCode('CODE-APPROVED')).toBe(false)
    })

    it('allows resubmission for results-stage statuses', () => {
        expect(canResubmitStudyCode('FILES-APPROVED')).toBe(true)
        expect(canResubmitStudyCode('FILES-REJECTED')).toBe(true)
        expect(canResubmitStudyCode('JOB-ERRORED')).toBe(true)
        expect(canResubmitStudyCode('RUN-COMPLETE')).toBe(true)
    })

    it('returns false for in-review and empty statuses', () => {
        expect(canResubmitStudyCode('CODE-SUBMITTED')).toBe(false)
        expect(canResubmitStudyCode('CODE-SCANNED')).toBe(false)
        expect(canResubmitStudyCode(null)).toBe(false)
        expect(canResubmitStudyCode(undefined)).toBe(false)
    })
})
