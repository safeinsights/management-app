import { describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import {
    mockSessionWithTestData,
    insertTestStudyJobData,
    insertTestStudyOnly,
    insertTestOrg,
    insertTestUser,
    actionResult,
    faker,
} from '@/tests/unit.helpers'
import { fetchUsersOrgsWithStatsAction } from './org.actions'
import { markStudyAsViewedAction } from './study.actions'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
    }
})

async function insertEnclaveStudy({
    enclaveOrg,
    labOrg,
    researcherId,
    status = 'PENDING-REVIEW',
}: {
    enclaveOrg: { id: string }
    labOrg: { id: string }
    researcherId: string
    status?: StudyStatus
}) {
    return await db
        .insertInto('study')
        .values({
            orgId: enclaveOrg.id,
            submittedByOrgId: labOrg.id,
            containerLocation: 'test-container',
            title: faker.lorem.words(3),
            researcherId,
            piName: 'test',
            status,
            dataSources: ['all'],
            outputMimeType: 'text/csv',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
}

async function insertEnclaveStudyWithJob({
    enclaveOrg,
    labOrg,
    researcherId,
    jobStatus,
}: {
    enclaveOrg: { id: string }
    labOrg: { id: string }
    researcherId: string
    jobStatus: StudyJobStatus
}) {
    const study = await insertEnclaveStudy({ enclaveOrg, labOrg, researcherId, status: 'APPROVED' })

    const job = await db.insertInto('studyJob').values({ studyId: study.id }).returning('id').executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({ status: jobStatus, studyJobId: job.id, userId: researcherId })
        .execute()

    return { study, job }
}

describe('fetchUsersOrgsWithStatsAction event counts', () => {
    describe('Research Lab counts', () => {
        it('counts APPROVED studies for the study owner', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            await insertTestStudyOnly({ org, researcherId: user.id, status: 'APPROVED' })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const labOrg = orgs.find((o) => o.id === org.id)
            expect(Number(labOrg?.eventCount)).toBe(1)
        })

        it('counts REJECTED studies for the study owner', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            await insertTestStudyOnly({ org, researcherId: user.id, status: 'REJECTED' })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const labOrg = orgs.find((o) => o.id === org.id)
            expect(Number(labOrg?.eventCount)).toBe(1)
        })

        it('does not count DRAFT or PENDING-REVIEW studies', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            await insertTestStudyOnly({ org, researcherId: user.id, status: 'DRAFT' })
            await insertTestStudyOnly({ org, researcherId: user.id, status: 'PENDING-REVIEW' })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const labOrg = orgs.find((o) => o.id === org.id)
            expect(Number(labOrg?.eventCount)).toBe(0)
        })

        it('does not count studies owned by other researchers', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { user: otherUser } = await insertTestUser({ org })
            await insertTestStudyOnly({ org, researcherId: otherUser.id, status: 'APPROVED' })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const labOrg = orgs.find((o) => o.id === org.id)
            expect(Number(labOrg?.eventCount)).toBe(0)
        })

        it('counts job statuses CODE-APPROVED, CODE-REJECTED, JOB-ERRORED, FILES-APPROVED, FILES-REJECTED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const attentionStatuses = [
                'CODE-APPROVED',
                'CODE-REJECTED',
                'JOB-ERRORED',
                'FILES-APPROVED',
                'FILES-REJECTED',
            ] as const
            for (const status of attentionStatuses) {
                await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED', jobStatus: status })
            }

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const labOrg = orgs.find((o) => o.id === org.id)
            expect(Number(labOrg?.eventCount)).toBe(5)
        })

        it('clears count after the study owner views the study', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id, status: 'APPROVED' })

            const before = actionResult(await fetchUsersOrgsWithStatsAction())
            expect(Number(before.find((o) => o.id === org.id)?.eventCount)).toBe(1)

            await markStudyAsViewedAction({ studyId: study.id })

            const after = actionResult(await fetchUsersOrgsWithStatsAction())
            expect(Number(after.find((o) => o.id === org.id)?.eventCount)).toBe(0)
        })
    })

    describe('Data Organization counts', () => {
        it('counts PENDING-REVIEW studies for enclave members', async () => {
            const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
            const { user: labUser } = await insertTestUser({ org: lab })

            const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
            await insertEnclaveStudy({ enclaveOrg: enclave, labOrg: lab, researcherId: labUser.id })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const enclaveOrg = orgs.find((o) => o.id === enclave.id)
            expect(Number(enclaveOrg?.eventCount)).toBe(1)
        })

        it('counts CODE-SUBMITTED, JOB-ERRORED, RUN-COMPLETE job statuses', async () => {
            const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
            const { user: labUser } = await insertTestUser({ org: lab })

            const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })

            for (const jobStatus of ['CODE-SUBMITTED', 'JOB-ERRORED', 'RUN-COMPLETE'] as const) {
                await insertEnclaveStudyWithJob({
                    enclaveOrg: enclave,
                    labOrg: lab,
                    researcherId: labUser.id,
                    jobStatus,
                })
            }

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const enclaveOrg = orgs.find((o) => o.id === enclave.id)
            expect(Number(enclaveOrg?.eventCount)).toBe(3)
        })

        it('clears count when any org member views the study', async () => {
            const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
            const { user: labUser } = await insertTestUser({ org: lab })

            const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
            // reviewer1 is another enclave member who will view the study
            const { user: reviewer1 } = await insertTestUser({ org: enclave })
            // session user (reviewer2) checks the counts
            await mockSessionWithTestData({ orgType: 'enclave', orgSlug: enclave.slug })

            const { study } = await insertEnclaveStudyWithJob({
                enclaveOrg: enclave,
                labOrg: lab,
                researcherId: labUser.id,
                jobStatus: 'CODE-SUBMITTED',
            })

            const before = actionResult(await fetchUsersOrgsWithStatsAction())
            expect(Number(before.find((o) => o.id === enclave.id)?.eventCount)).toBe(1)

            // reviewer1 views the study (not the session user)
            await db.insertInto('studyView').values({ studyId: study.id, userId: reviewer1.id }).execute()

            const after = actionResult(await fetchUsersOrgsWithStatsAction())
            expect(Number(after.find((o) => o.id === enclave.id)?.eventCount)).toBe(0)
        })

        it('does not count APPROVED or REJECTED studies (not enclave attention statuses)', async () => {
            const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
            const { user: labUser } = await insertTestUser({ org: lab })

            const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
            await insertEnclaveStudy({ enclaveOrg: enclave, labOrg: lab, researcherId: labUser.id, status: 'APPROVED' })

            const orgs = actionResult(await fetchUsersOrgsWithStatsAction())
            const enclaveOrg = orgs.find((o) => o.id === enclave.id)
            expect(Number(enclaveOrg?.eventCount)).toBe(0)
        })
    })
})
