import { db, describe, expect, it } from '@/tests/unit.helpers'
import { DEFAULT_REF_IDS, resolveRefs, resolveTargetRefs, SAMPLE_TARGET } from './refs'

describe('resolveTargetRefs', () => {
    it('names each missing org slug and account email', async () => {
        const result = await resolveTargetRefs(db, { ...SAMPLE_TARGET, adminEmail: 'qa-nobody@example.com' })
        expect(result).toEqual({ missing: ['qa-nobody@example.com', 'mars-u', 'mars-u-lab'] })
    })

    it('finds the Mars U orgs by slug and the QA accounts by email', async () => {
        await db
            .insertInto('org')
            .values([
                { slug: 'mars-u', name: 'Mars University', email: 'mars@example.com', type: 'enclave' },
                { slug: 'mars-u-lab', name: 'Mars University Lab', email: 'mars@example.com', type: 'lab' },
            ])
            .execute()

        const result = await resolveTargetRefs(db)
        expect(result).toMatchObject({ refs: { enclave: { slug: 'mars-u' }, lab: { slug: 'mars-u-lab' } } })
    })
})

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
