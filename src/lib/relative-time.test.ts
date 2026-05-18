import { describe, expect, it } from '@/tests/unit.helpers'
import { formatTimeAgo } from './relative-time'

const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES
const DAYS = 24 * HOURS

const now = new Date('2026-04-24T12:00:00Z')
const minus = (ms: number) => new Date(now.getTime() - ms)

describe('formatTimeAgo', () => {
    it('returns null for null or invalid dates', () => {
        expect(formatTimeAgo(null, now)).toBeNull()
        expect(formatTimeAgo(new Date('invalid'), now)).toBeNull()
    })

    it('returns null for future dates', () => {
        expect(formatTimeAgo(new Date('2026-04-25T00:00:00Z'), now)).toBeNull()
    })

    it('returns "just now" for < 30 seconds', () => {
        expect(formatTimeAgo(minus(0), now)).toBe('just now')
        expect(formatTimeAgo(minus(29 * SECONDS), now)).toBe('just now')
    })

    it('returns "less than a minute ago" for 30-59 seconds', () => {
        expect(formatTimeAgo(minus(30 * SECONDS), now)).toBe('less than a minute ago')
        expect(formatTimeAgo(minus(59 * SECONDS), now)).toBe('less than a minute ago')
    })

    it('returns minutes for 1-59 minutes', () => {
        expect(formatTimeAgo(minus(1 * MINUTES), now)).toBe('1 minute ago')
        expect(formatTimeAgo(minus(5 * MINUTES), now)).toBe('5 minutes ago')
        expect(formatTimeAgo(minus(59 * MINUTES), now)).toBe('59 minutes ago')
    })

    it('returns hours for 1-23 hours', () => {
        expect(formatTimeAgo(minus(1 * HOURS), now)).toBe('1 hour ago')
        expect(formatTimeAgo(minus(12 * HOURS), now)).toBe('12 hours ago')
    })

    it('returns days for 1-7 days', () => {
        expect(formatTimeAgo(minus(1 * DAYS), now)).toBe('1 day ago')
        expect(formatTimeAgo(minus(7 * DAYS), now)).toBe('7 days ago')
    })

    it('shows a date string beyond 7 days', () => {
        expect(formatTimeAgo(minus(8 * DAYS), now)).toBe('on Apr 16, 2026')
        expect(formatTimeAgo(minus(90 * DAYS), now)).toBe('on Jan 24, 2026')
    })
})
