import { describe, it, expect } from 'vitest'
import { canResubmitStudyCode } from './code-resubmission'

describe('canResubmitStudyCode', () => {
    it('allows resubmission only for CODE-CHANGES-REQUESTED among code decisions', () => {
        expect(canResubmitStudyCode('CODE-CHANGES-REQUESTED')).toBe(true)
        // CODE-REJECTED is terminal: a rejected study allows no resubmission, only a new proposal.
        expect(canResubmitStudyCode('CODE-REJECTED')).toBe(false)
        expect(canResubmitStudyCode('CODE-APPROVED')).toBe(false)
    })

    it('allows resubmission for a decided results round (round-closing statuses)', () => {
        expect(canResubmitStudyCode('FILES-APPROVED')).toBe(true)
        expect(canResubmitStudyCode('FILES-REJECTED')).toBe(true)
    })

    it('disallows resubmission from a results round still awaiting the files decision', () => {
        // Bare RUN-COMPLETE / JOB-ERRORED live on the same job a FILES-* decision later closes;
        // resubmitting from them would reuse the job and silently no-op (see CODE_RESUBMITTABLE_JOB_STATUSES).
        expect(canResubmitStudyCode('RUN-COMPLETE')).toBe(false)
        expect(canResubmitStudyCode('JOB-ERRORED')).toBe(false)
    })

    it('returns false for in-review and empty statuses', () => {
        expect(canResubmitStudyCode('CODE-SUBMITTED')).toBe(false)
        expect(canResubmitStudyCode('CODE-SCANNED')).toBe(false)
        expect(canResubmitStudyCode(null)).toBe(false)
        expect(canResubmitStudyCode(undefined)).toBe(false)
    })
})
