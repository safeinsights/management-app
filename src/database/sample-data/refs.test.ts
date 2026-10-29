import { db, describe, expect, it } from '@/tests/unit.helpers'
import { DEFAULT_REF_IDS, resolveRefs } from './refs'

describe('resolveRefs', () => {
    it('finds the fixed test users and orgs the test-user seed writes', async () => {
        const result = await resolveRefs(db)
        expect(result).toMatchObject({ refs: { enclave: { slug: 'openstax' }, lab: { slug: 'openstax-lab' } } })
    })

    it('names each fixed id it cannot find', async () => {
        const absent = '00000000-0000-4000-8000-00000001ffff'
        const result = await resolveRefs(db, { ...DEFAULT_REF_IDS, researcherId: absent })
        expect(result).toEqual({ missing: [absent] })
    })
})
