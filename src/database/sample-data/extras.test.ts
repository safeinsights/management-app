import { db, describe, expect, insertTestOrg, it } from '@/tests/unit.helpers'
import { resolveRefs } from './refs'
import { FAKE_PEOPLE, seedExtras } from './extras'

const refsOrThrow = async () => {
    const result = await resolveRefs(db)
    if (!('refs' in result)) throw new Error(`missing ${result.missing}`)
    return result.refs
}

describe('seedExtras', () => {
    it('adds the fake people to their orgs once', async () => {
        const refs = await refsOrThrow()
        await seedExtras(db, refs)
        await seedExtras(db, refs)

        const memberships = await db
            .selectFrom('orgUser')
            .select(['userId', 'orgId'])
            .where(
                'userId',
                'in',
                FAKE_PEOPLE.map((p) => p.id),
            )
            .execute()
        expect(memberships).toHaveLength(FAKE_PEOPLE.length)
    })

    it('does not replace a researcher profile that already exists', async () => {
        const refs = await refsOrThrow()
        await seedExtras(db, refs)
        await db
            .updateTable('researcherProfile')
            .set({ educationDegree: 'Kept by QA' })
            .where('userId', '=', refs.researcherId)
            .execute()
        await seedExtras(db, refs)

        const profile = await db
            .selectFrom('researcherProfile')
            .select('educationDegree')
            .where('userId', '=', refs.researcherId)
            .executeTakeFirstOrThrow()
        expect(profile.educationDegree).toBe('Kept by QA')
    })

    it('gives a code env with no scan a completed one', async () => {
        const org = await insertTestOrg()
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Unscanned env',
                language: 'PYTHON',
                url: 'public.ecr.aws/docker/library/python:latest',
                commandLines: { py: 'python main.py' },
                isTesting: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await seedExtras(db, await refsOrThrow())

        const scans = await db.selectFrom('codeScan').select('status').where('codeEnvId', '=', codeEnv.id).execute()
        expect(scans).toEqual([{ status: 'SCAN-COMPLETE' }])
    })
})
