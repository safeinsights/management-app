import {
    db,
    describe,
    expect,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    insertTestUser,
    it,
} from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import { backfillStudyLastOpened } from './migrations/1787600000000_study_last_opened'

const openedBy = async (studyId: string) =>
    (await db.selectFrom('studyLastOpened').select('userId').where('studyId', '=', studyId).execute())
        .map((row) => row.userId)
        .sort()

const backfill = () => backfillStudyLastOpened(db as unknown as Kysely<unknown>)

async function labAndPartner() {
    const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const partner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const { user: researcher } = await insertTestUser({ org: lab })
    const { user: reviewer } = await insertTestUser({ org: partner })
    return { lab, partner, researcher, reviewer }
}

describe('study_last_opened migration', () => {
    it('marks a submitted study opened for the members of both orgs', async () => {
        const { lab, partner, researcher, reviewer } = await labAndPartner()
        const { study } = await insertTestStudyOnly({
            org: partner,
            submittedByOrg: lab,
            researcherId: researcher.id,
            status: 'PENDING-REVIEW',
        })

        await backfill()

        expect(await openedBy(study.id)).toEqual([researcher.id, reviewer.id].sort())
    })

    it('keeps a draft away from the data partner, who cannot see it', async () => {
        const { lab, partner, researcher } = await labAndPartner()
        const { study } = await insertTestStudyOnly({
            org: partner,
            submittedByOrg: lab,
            researcherId: researcher.id,
            status: 'DRAFT',
        })

        await backfill()

        expect(await openedBy(study.id)).toEqual([researcher.id])
    })

    it('skips deleted studies and is safe to run twice', async () => {
        const { lab, partner, researcher } = await labAndPartner()
        const { study: deleted } = await insertTestStudyOnly({
            org: partner,
            submittedByOrg: lab,
            researcherId: researcher.id,
        })
        await db.updateTable('study').set({ deletedAt: new Date() }).where('id', '=', deleted.id).execute()
        const { study: kept } = await insertTestStudyOnly({
            org: partner,
            submittedByOrg: lab,
            researcherId: researcher.id,
        })

        await backfill()
        await backfill()

        expect(await openedBy(deleted.id)).toEqual([])
        expect(await openedBy(kept.id)).toHaveLength(2)
    })
})
