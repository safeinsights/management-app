import { db, describe, expect, insertTestOrg, it } from '@/tests/unit.helpers'
import { resolveRefs } from './refs'
import { FAKE_PEOPLE, PENDING_INVITES, seedExtras } from './extras'
import { ORGS } from '../seeds/1743608138837_test_users'

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

    it('leaves code envs outside the fixed test orgs unscanned', async () => {
        const org = await insertTestOrg()
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Real org env',
                language: 'PYTHON',
                url: 'public.ecr.aws/docker/library/python:latest',
                commandLines: { py: 'python main.py' },
                isTesting: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await seedExtras(db, await refsOrThrow())

        expect(await db.selectFrom('codeScan').select('id').where('codeEnvId', '=', codeEnv.id).execute()).toEqual([])
    })

    it('gives each code env of the fixed test orgs a completed scan', async () => {
        await seedExtras(db, await refsOrThrow())
        const envs = await db
            .selectFrom('orgCodeEnv')
            .select('id')
            .where(
                'orgId',
                'in',
                ORGS.map((o) => o.id),
            )
            .execute()
        const scanned = await db
            .selectFrom('codeScan')
            .select('codeEnvId')
            .distinct()
            .where('status', '=', 'SCAN-COMPLETE')
            .where(
                'codeEnvId',
                'in',
                envs.map((e) => e.id),
            )
            .execute()
        expect(envs.length).toBeGreaterThan(0)
        expect(scanned).toHaveLength(envs.length)
    })

    it('uses mailinator addresses, like the other test users, so no mail bounces', () => {
        for (const person of FAKE_PEOPLE) expect(person.email).toMatch(/@mailinator\.com$/)
        for (const email of PENDING_INVITES) expect(email).toMatch(/@mailinator\.com$/)
    })
})
