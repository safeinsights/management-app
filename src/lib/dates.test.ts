import { describe, expect, it } from 'vitest'
import { EMPTY_CELL, formatInstantAsUtcDay, formatInstantAsUtcDayLabel } from './dates'

describe('formatInstantAsUtcDay', () => {
    it('takes the UTC day, not the local one', () => {
        expect(formatInstantAsUtcDay(new Date('2026-05-04T00:30:00Z'))).toBe('May 04, 2026')
    })

    it('accepts an ISO string, which is how a timestamp can cross a server action', () => {
        expect(formatInstantAsUtcDay('2026-05-04T00:30:00Z')).toBe('May 04, 2026')
    })

    it('dashes a missing value', () => {
        expect(formatInstantAsUtcDay(null)).toBe(EMPTY_CELL)
    })
})

describe('formatInstantAsUtcDayLabel', () => {
    it('names the month and the zone', () => {
        expect(formatInstantAsUtcDayLabel(new Date('2026-09-24T01:30:00Z'))).toBe('Sep 24, 2026 (UTC)')
    })

    it('keeps the UTC day just before UTC midnight', () => {
        expect(formatInstantAsUtcDayLabel(new Date('2026-09-23T23:59:00Z'))).toBe('Sep 23, 2026 (UTC)')
    })
})
