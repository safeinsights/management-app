import {
    db,
    describe,
    expect,
    faker,
    insertTestBaselineJob,
    insertTestOrg,
    insertTestStudyOnly,
    insertTestUser,
    it,
} from '@/tests/unit.helpers'
import type { Kysely } from 'kysely'
import { backfillActivityOrg } from './migrations/1786700000000_study_job_file_activity_org'

describe('study_job_file_activity_org migration', () => {
    it('attributes existing activity to the Data Partner for its members and to the lab for everyone else', async () => {
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        // Stands in for the NULL the column starts as: the backfill must overwrite it.
        const unrelated = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user: reviewer } = await insertTestUser({ org: enclave })
        const { user: researcher } = await insertTestUser({ org: lab })
        const { study } = await insertTestStudyOnly({ org: enclave, submittedByOrg: lab, researcherId: researcher.id })
        const job = await insertTestBaselineJob(study.id)
        const archive = await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: 'results/results.zip',
                fileType: 'ENCRYPTED-RESULT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const [reviewerRow, researcherRow] = await db
            .insertInto('studyJobFileActivity')
            .values([
                {
                    studyJobFileId: archive.id,
                    filePath: 'a.csv',
                    userId: reviewer.id,
                    orgId: unrelated.id,
                    action: 'VIEWED',
                },
                {
                    studyJobFileId: archive.id,
                    filePath: 'a.csv',
                    userId: researcher.id,
                    orgId: unrelated.id,
                    action: 'VIEWED',
                },
            ])
            .returning('id')
            .execute()

        await backfillActivityOrg(db as unknown as Kysely<unknown>)

        const orgOf = async ({ id }: { id: string }) => {
            const row = await db
                .selectFrom('studyJobFileActivity')
                .select('orgId')
                .where('id', '=', id)
                .executeTakeFirstOrThrow()
            return row.orgId
        }
        expect(await orgOf(reviewerRow)).toBe(enclave.id)
        expect(await orgOf(researcherRow)).toBe(lab.id)
    })
})
