import { describe, expect, it } from '@/tests/unit.helpers'
import { queryKeys } from './query-keys'

// React Query invalidates by prefix, so a writer's key must prefix every reader's key for the same
// action; two readers once used different roots and a publish refreshed only one.
describe('queryKeys.legal', () => {
    it('invalidates every scope of a type it publishes', () => {
        const prefix = queryKeys.legal.versionsForType('DOPA')

        for (const scope of [{ orgId: 'org-1' }, { studyId: 'study-1' }, {}]) {
            const key = queryKeys.legal.versions({ type: 'DOPA', ...scope })
            expect(key.slice(0, prefix.length)).toEqual([...prefix])
        }
    })

    it('does not reach another document type', () => {
        const prefix = queryKeys.legal.versionsForType('DOPA')
        const otherType = queryKeys.legal.versions({ type: 'SLA', studyId: 'study-1' })

        expect(otherType.slice(0, prefix.length)).not.toEqual([...prefix])
    })
})
