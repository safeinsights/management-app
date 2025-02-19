import { describe, it, expect } from 'vitest'
import { humanizeStatus } from './status'

describe('humanizeStatus', () => {
    it('should convert status to human readable format with capitalization', () => {
        const testCases = [
            ['CODE-REJECTED', 'Code Rejected'],
            ['CODE-SUBMITTED', 'Code Submitted'],
            ['RUN-COMPLETE', 'Run Complete'],
            ['ERRORED', 'Errored'],
            ['INITIATED', 'Initiated'],
            ['READY', 'Ready'],
            ['RESULTS-REJECTED', 'Results Rejected'],
            ['RESULTS-APPROVED', 'Results Approved'],
            ['RUNNING', 'Running'],
        ] as const

        testCases.forEach(([input, expected]) => {
            expect(humanizeStatus(input)).toBe(expected)
        })
    })
})
