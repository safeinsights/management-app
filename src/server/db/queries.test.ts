import { describe, expect, it } from 'vitest'
import {
    insertTestBaseImage,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyJobUsers,
} from '@/tests/unit.helpers'
import {
    getReviewerPublicKey,
    getUsersForOrgId,
    jobInfoForJobId,
    latestJobForStudy,
    studyInfoForStudyId,
} from './queries'

async function insertRecords() {
    const org1 = await insertTestOrg({ slug: 'test-org-1' })
    const org2 = await insertTestOrg({ slug: 'test-org-2' })
    const {
        user1: org1User1,
        user2: org1User2,
        job: job1,
        study: study1,
    } = await insertTestStudyJobUsers({ org: org1 })
    const {
        user1: org2User1,
        user2: org2User2,
        job: job2,
        study: study2,
    } = await insertTestStudyJobUsers({ org: org2 })

    return {
        study1,
        study2,
        job1,
        job2,
        org1,
        org2,
        org1User1,
        org1User2,
        org2User1,
        org2User2,
    }
}

const invalidUUID = '00000000-0000-0000-0000-000000000000'

describe('getReviewerPublicKey', () => {
    it('returns public key when userId is valid', async () => {
        const { org1User1 } = await insertRecords()
        const publicKey = await getReviewerPublicKey(org1User1.id)
        expect(publicKey).not.toBeNull()
    })

    it('returns null when userId is invalid', async () => {
        const publicKey = await getReviewerPublicKey(invalidUUID)
        expect(publicKey).toBeUndefined()
    })
})

describe('jobInfoForJobId', () => {
    it('returns job info when jobId is valid', async () => {
        const { job1, org1 } = await insertRecords()
        const jobInfo = await jobInfoForJobId(job1.id)
        expect(jobInfo).not.toBeNull()
        expect(jobInfo?.studyJobId).toBe(job1.id)
        expect(jobInfo?.orgSlug).toBe(org1.slug)
    })
})

describe('studyInfoForStudyId', () => {
    it('returns study info when studyId is valid', async () => {
        const { study1, org1 } = await insertRecords()
        const studyInfo = await studyInfoForStudyId(study1.id)
        expect(studyInfo).not.toBeNull()
        expect(studyInfo?.studyId).toBe(study1.id)
        expect(studyInfo?.orgSlug).toBe(org1.slug)
    })

    it('returns null when studyId is invalid', async () => {
        const studyInfo = await studyInfoForStudyId(invalidUUID)
        expect(studyInfo).toBeUndefined()
    })
})

describe('getUsersForOrgId', () => {
    it('returns users for an org', async () => {
        const { org1, org1User1 } = await insertRecords()
        const users = await getUsersForOrgId(org1.id)
        expect(users).not.toBeNull()
        expect(users.length).toBeGreaterThan(0)
        const userIds = users.map((u) => u.id)
        expect(userIds).toContain(org1User1.id)
    })

    it('returns empty array when orgId is invalid', async () => {
        const users = await getUsersForOrgId(invalidUUID)
        expect(users).toEqual([])
    })
})

describe('latestJobForStudy', () => {
    it('selects the newest non-testing base image for the study language', async () => {
        const org = await insertTestOrg({ slug: 'test-org-base-image-ordering' })
        const { study } = await insertTestStudyJobData({
            org: { id: org.id, slug: org.slug, type: org.type },
            language: 'R',
            jobStatus: 'JOB-READY',
        })

        // Same org, same language (R): choose the newest one
        await insertTestBaseImage({
            orgId: org.id,
            language: 'R',
            url: 'http://example.com/r-prod-old',
            isTesting: false,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
        })

        await insertTestBaseImage({
            orgId: org.id,
            language: 'R',
            url: 'http://example.com/r-prod-new',
            isTesting: false,
            createdAt: new Date('2024-02-01T00:00:00.000Z'),
        })

        // Same org, same language (R) but testing image: should be ignored even if newest
        await insertTestBaseImage({
            orgId: org.id,
            language: 'R',
            url: 'http://example.com/r-testing-newest',
            isTesting: true,
            createdAt: new Date('2024-03-01T00:00:00.000Z'),
        })

        // Same org but different language: should be ignored
        await insertTestBaseImage({
            orgId: org.id,
            language: 'PYTHON',
            url: 'http://example.com/python-prod-newest',
            isTesting: false,
            createdAt: new Date('2024-04-01T00:00:00.000Z'),
        })

        const job = await latestJobForStudy(study.id)
        expect(job.baseImageUrl).toBe('http://example.com/r-prod-new')
    })

    it('returns null baseImageUrl when no matching base image exists (deleted or never created)', async () => {
        const org = await insertTestOrg({ slug: 'test-org-base-image-missing' })
        const { study } = await insertTestStudyJobData({
            org: { id: org.id, slug: org.slug, type: org.type },
            language: 'R',
            jobStatus: 'JOB-ERRORED',
        })

        const job = await latestJobForStudy(study.id)
        expect(job.baseImageUrl).toBeNull()
    })
})
