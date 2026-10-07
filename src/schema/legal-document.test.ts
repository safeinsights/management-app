import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    legalDocumentQueryKeys,
    MAX_LEGAL_DOCUMENT_BYTES,
    publishLegalDocumentVersionSchema,
    signedAtErrorFor,
} from './legal-document'

const publishWith = (signedAt: string) =>
    publishLegalDocumentVersionSchema.safeParse({ versionId: 'a-version', signedAt })

const TODAY = '2026-09-28'
const TOMORROW = '2026-09-29'
const TOO_FAR = '2026-09-30'

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})

afterEach(() => vi.useRealTimers())

// Publishing cannot be undone, and the shape check alone accepted both of these.
describe('publishLegalDocumentVersionSchema signedAt', () => {
    it('accepts a real day that has already happened', () => {
        expect(publishWith('2026-07-27').success).toBe(true)
    })

    it('rejects a day the calendar does not have', () => {
        expect(publishWith('2026-02-30').success).toBe(false)
    })

    it('rejects a mistyped year far in the future', () => {
        expect(publishWith('2206-07-27').success).toBe(false)
    })

    // One day of slack, because this runs on a UTC clock while the admin's date input is local.
    it('allows the day either side of the UTC clock, but not the one after', () => {
        expect(publishWith(TODAY).success).toBe(true)
        expect(publishWith(TOMORROW).success).toBe(true)
        expect(publishWith(TOO_FAR).success).toBe(false)
    })

    it('stays optional', () => {
        expect(publishLegalDocumentVersionSchema.safeParse({ versionId: 'a-version' }).success).toBe(true)
    })
})

describe('signedAtErrorFor', () => {
    it('says nothing about a field the admin has not filled in yet', () => {
        expect(signedAtErrorFor('')).toBeUndefined()
    })

    it('reports the rule the date breaks', () => {
        expect(signedAtErrorFor('2028-01-01')).toBe('Signed date cannot be in the future')
        expect(signedAtErrorFor('2026-02-30')).toBe('Signed date is not a real calendar date')
    })

    it('says nothing about a day that passes', () => {
        expect(signedAtErrorFor('2026-07-27')).toBeUndefined()
    })

    it('agrees with the schema on the day of slack it allows', () => {
        expect(signedAtErrorFor(TOMORROW)).toBeUndefined()
        expect(publishWith(TOMORROW).success).toBe(true)
    })
})

// React Query invalidates by prefix, so a writer's key must prefix every reader's key for the same
// action; two readers once used different roots and a publish refreshed only one.
describe('legalDocumentQueryKeys', () => {
    it('invalidates every scope of a type it publishes', () => {
        const prefix = legalDocumentQueryKeys.versionsForType('DOPA')

        for (const scope of [{ orgId: 'org-1' }, { studyId: 'study-1' }, {}]) {
            const key = legalDocumentQueryKeys.versions({ type: 'DOPA', ...scope })
            expect(key.slice(0, prefix.length)).toEqual([...prefix])
        }
    })

    it('does not reach another document type', () => {
        const prefix = legalDocumentQueryKeys.versionsForType('DOPA')
        const otherType = legalDocumentQueryKeys.versions({ type: 'SLA', studyId: 'study-1' })

        expect(otherType.slice(0, prefix.length)).not.toEqual([...prefix])
    })
})

// The cap only holds if next.config still carries a body limit above it: the upload rides a server
// action, and Next rejects an over-limit body before any of our validation runs.
describe('MAX_LEGAL_DOCUMENT_BYTES', () => {
    it('stays under the serverActions body limit next.config sets', () => {
        const config = readFileSync('next.config.ts', 'utf-8')
        const limit = config.match(/bodySizeLimit:\s*'(\d+)mb'/)

        // Asserted before the comparison so a reformat fails here rather than passing vacuously.
        expect(limit).not.toBeNull()
        expect(MAX_LEGAL_DOCUMENT_BYTES).toBeLessThan(Number(limit![1]) * 1024 * 1024)
    })
})
