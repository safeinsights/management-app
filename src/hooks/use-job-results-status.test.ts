import { describe, expect, it } from 'vitest'
import { extractJobStatus, type StatusChange } from './use-job-results-status'

describe('extractJobStatus', () => {
    it('returns all false for empty array', () => {
        expect(extractJobStatus([])).toEqual({
            isApproved: false,
            isRejected: false,
            isFilesRejected: false,
            isCodeRejected: false,
            isComplete: false,
            isErrored: false,
        })
    })

    it('sets isCodeRejected and isRejected for CODE-REJECTED', () => {
        const changes: StatusChange[] = [{ status: 'CODE-REJECTED' }]
        const result = extractJobStatus(changes)
        expect(result.isCodeRejected).toBe(true)
        expect(result.isRejected).toBe(true)
    })

    it('sets isFilesRejected and isRejected for FILES-REJECTED', () => {
        const changes: StatusChange[] = [{ status: 'FILES-REJECTED' }]
        const result = extractJobStatus(changes)
        expect(result.isFilesRejected).toBe(true)
        expect(result.isRejected).toBe(true)
    })

    it('sets isApproved for FILES-APPROVED', () => {
        const changes: StatusChange[] = [{ status: 'FILES-APPROVED' }]
        const result = extractJobStatus(changes)
        expect(result.isApproved).toBe(true)
        expect(result.isRejected).toBe(false)
    })

    it('sets isComplete for RUN-COMPLETE', () => {
        const changes: StatusChange[] = [{ status: 'RUN-COMPLETE' }]
        const result = extractJobStatus(changes)
        expect(result.isComplete).toBe(true)
    })

    it('sets isErrored for JOB-ERRORED', () => {
        const changes: StatusChange[] = [{ status: 'JOB-ERRORED' }]
        const result = extractJobStatus(changes)
        expect(result.isErrored).toBe(true)
    })

    it('ignores unmapped statuses', () => {
        const changes: StatusChange[] = [{ status: 'CODE-SCANNED' }, { status: 'CODE-APPROVED' }]
        const result = extractJobStatus(changes)
        expect(result).toEqual({
            isApproved: false,
            isRejected: false,
            isFilesRejected: false,
            isCodeRejected: false,
            isComplete: false,
            isErrored: false,
        })
    })

    it('handles multiple status changes', () => {
        const changes: StatusChange[] = [{ status: 'RUN-COMPLETE' }, { status: 'FILES-APPROVED' }]
        const result = extractJobStatus(changes)
        expect(result.isComplete).toBe(true)
        expect(result.isApproved).toBe(true)
        expect(result.isRejected).toBe(false)
    })

    // OTTER-471: a corrupted history with both terminal rows must collapse to one decision,
    // not flip both flags. statusChanges arrives ordered `createdAt desc, id desc`.
    it('OTTER-471: picks the latest terminal when both FILES-APPROVED and FILES-REJECTED exist', () => {
        const latestApproved: StatusChange[] = [{ status: 'FILES-APPROVED' }, { status: 'FILES-REJECTED' }]
        const approvedResult = extractJobStatus(latestApproved)
        expect(approvedResult.isApproved).toBe(true)
        expect(approvedResult.isFilesRejected).toBe(false)
        expect(approvedResult.isRejected).toBe(false)

        const latestRejected: StatusChange[] = [{ status: 'FILES-REJECTED' }, { status: 'FILES-APPROVED' }]
        const rejectedResult = extractJobStatus(latestRejected)
        expect(rejectedResult.isApproved).toBe(false)
        expect(rejectedResult.isFilesRejected).toBe(true)
        expect(rejectedResult.isRejected).toBe(true)
    })

    // OTTER-471: same invariant for CODE-APPROVED / CODE-REJECTED. CODE-APPROVED isn't
    // mapped to a flag, but CODE-REJECTED is — so without the dedup, a corrupted history
    // with latest CODE-APPROVED + older CODE-REJECTED would leave isCodeRejected=true.
    it('OTTER-471: latest CODE-APPROVED suppresses an older CODE-REJECTED flag', () => {
        const latestCodeApproved: StatusChange[] = [{ status: 'CODE-APPROVED' }, { status: 'CODE-REJECTED' }]
        const codeApprovedResult = extractJobStatus(latestCodeApproved)
        expect(codeApprovedResult.isCodeRejected).toBe(false)
        expect(codeApprovedResult.isRejected).toBe(false)

        const latestCodeRejected: StatusChange[] = [{ status: 'CODE-REJECTED' }, { status: 'CODE-APPROVED' }]
        const codeRejectedResult = extractJobStatus(latestCodeRejected)
        expect(codeRejectedResult.isCodeRejected).toBe(true)
        expect(codeRejectedResult.isRejected).toBe(true)
    })
})
