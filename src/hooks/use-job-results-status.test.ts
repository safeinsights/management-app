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
})
