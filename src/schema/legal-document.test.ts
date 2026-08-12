import { describe, expect, it } from 'vitest'
import { legalDocumentQueryKeys } from './legal-document'

// React Query invalidates by prefix, so a writer's key must prefix every reader's key for the same
// action. It didn't: the tos/pn tab read versions under ['legalVersions', …] while the version
// history modal used ['legalDocumentVersions', …], and a publish refreshed only one of them.
describe('legalDocumentQueryKeys', () => {
    it('invalidates every scope of a type it publishes', () => {
        const prefix = legalDocumentQueryKeys.versionsForType('dopa')

        for (const scope of [{ orgId: 'org-1' }, { studyId: 'study-1' }, {}]) {
            const key = legalDocumentQueryKeys.versions({ type: 'dopa', ...scope })
            expect(key.slice(0, prefix.length)).toEqual([...prefix])
        }
    })

    it('does not reach another document type', () => {
        const prefix = legalDocumentQueryKeys.versionsForType('dopa')
        const otherType = legalDocumentQueryKeys.versions({ type: 'sla', studyId: 'study-1' })

        expect(otherType.slice(0, prefix.length)).not.toEqual([...prefix])
    })
})
