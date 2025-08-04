import { describe, expect, it } from 'vitest'
import { insertTestOrg, insertTestStudyJobUsers } from '@/tests/unit.helpers'
import { getReviewerPublicKey, getUsersByRoleAndOrgId, jobInfoForJobId, studyInfoForStudyId } from './queries'

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

describe('getUsersByRoleAndMemberId', () => {
    it('returns users with role reviewer for a member', async () => {
        const { org1, org1User1 } = await insertRecords()
        const users = await getUsersByRoleAndOrgId('reviewer', org1.id)
        expect(users).not.toBeNull()
        expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ id: org1User1.id })]))
    })

    it('returns users with role researcher for a member', async () => {
        const { org1, org1User2 } = await insertRecords()
        const users = await getUsersByRoleAndOrgId('researcher', org1.id)
        expect(users).not.toBeNull()
        expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ id: org1User2.id })]))
    })

    it('returns empty array when memberId is invalid', async () => {
        const users = await getUsersByRoleAndOrgId('researcher', invalidUUID)
        expect(users).toEqual([])
    })
})
