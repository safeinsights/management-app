import { describe, it, expect } from 'vitest'
import { humanizeStatus } from './status'

describe('humanizeStatus', () => {
    it('should convert status to human readable format with capitalization', () => {
        const testCases = [
            ['CODE-REJECTED', 'Code Rejected'],
            ['CODE-SUBMITTED', 'Code Submitted'],
            ['RUN-COMPLETE', 'Run Complete'],
            ['JOB-ERRORED', 'Job Errored'],
            ['INITIATED', 'Initiated'],
            ['JOB-READY', 'Job Ready'],
            ['RESULTS-REJECTED', 'Results Rejected'],
            ['RESULTS-APPROVED', 'Results Approved'],
            ['JOB-RUNNING', 'Job Running'],
        ] as const

        testCases.forEach(([input, expected]) => {
            expect(humanizeStatus(input)).toBe(expected)
        })
    })
})
