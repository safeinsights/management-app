import { describe, expect, it } from 'vitest'
import { legalDocumentQueryKeys, publishLegalDocumentVersionSchema } from './legal-document'

const publishWith = (signedAt: string) =>
    publishLegalDocumentVersionSchema.safeParse({ versionId: 'a-version', signedAt })

const dayOffsetFromToday = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Publishing cannot be undone, so a signed date that never happened has to be refused before the row
// exists. The shape check alone accepted both of these.
describe('publishLegalDocumentVersionSchema signedAt', () => {
    it('accepts a real day that has already happened', () => {
        expect(publishWith('2026-07-27').success).toBe(true)
    })

    it('rejects a day the calendar does not have', () => {
        // Reaches the `date` column as a Postgres 22008 rather than a field error without this.
        expect(publishWith('2026-02-30').success).toBe(false)
    })

    it('rejects a mistyped year far in the future', () => {
        expect(publishWith('2206-07-27').success).toBe(false)
    })

    // One day of slack, because this runs on a UTC clock while the admin's date input is local.
    it('allows the day either side of the UTC clock, but not the one after', () => {
        expect(publishWith(dayOffsetFromToday(1)).success).toBe(true)
        expect(publishWith(dayOffsetFromToday(2)).success).toBe(false)
    })

    // tos/pn are published, not signed; the action rejects a signedAt for them by type.
    it('stays optional', () => {
        expect(publishLegalDocumentVersionSchema.safeParse({ versionId: 'a-version' }).success).toBe(true)
    })
})

// React Query invalidates by prefix, so a writer's key must prefix every reader's key for the same
// action. It didn't: the tos/pn tab read versions under ['legalVersions', …] while the version
// history modal used ['legalDocumentVersions', …], and a publish refreshed only one of them.
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
