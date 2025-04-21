import { describe, expect, it } from 'vitest'
import { insertTestMember, insertTestStudyJobUsers, mockClerkSession } from '@/tests/unit.helpers'
import {
    checkMemberAllowedStudyReview,
    checkUserAllowedJobView,
    checkUserAllowedStudyView,
    getFirstOrganizationForUser,
    getMemberUserPublicKey,
    getUsersByRoleAndMemberId,
    jobInfoForJobId,
    latestJobForStudy,
    studyInfoForStudyId,
} from './queries'
import { AccessDeniedError } from '@/lib/errors'

async function insertRecords() {
    const member1 = await insertTestMember({ slug: 'test-member-1' })
    const member2 = await insertTestMember({ slug: 'test-member-2' })
    const {
        user1: member1User1,
        user2: member1User2,
        job: job1,
        study: study1,
    } = await insertTestStudyJobUsers({ member: member1 })
    const {
        user1: member2User1,
        user2: member2User2,
        job: job2,
        study: study2,
    } = await insertTestStudyJobUsers({ member: member2 })

    return {
        study1,
        study2,
        job1,
        job2,
        member1,
        member2,
        member1User1,
        member1User2,
        member2User1,
        member2User2,
    }
}

const invalidUUID = '00000000-0000-0000-0000-000000000000'

describe('checkUserAllowedJobView', () => {
    it('allows the user when they are a member of the study owning the job', async () => {
        const { job1, member1User1, member1 } = await insertRecords()
        mockClerkSession({ clerkUserId: member1User1.clerkId, org_slug: member1.slug })
        await expect(checkUserAllowedJobView(job1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when jobId is not provided', async () => {
        await expect(checkUserAllowedJobView(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a member of the study owning the job', async () => {
        const { member2User1, job1, member2 } = await insertRecords()
        mockClerkSession({ clerkUserId: member2User1.clerkId, org_slug: member2.slug })
        await expect(checkUserAllowedJobView(job1.id)).rejects.toThrow(AccessDeniedError)
    })
})

describe('checkUserAllowedStudyView', () => {
    it('allows the user when they are a member of the study', async () => {
        const { study1, member1, member1User1 } = await insertRecords()
        mockClerkSession({ clerkUserId: member1User1.clerkId, org_slug: member1.slug })
        await expect(checkUserAllowedStudyView(study1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when studyId is not provided', async () => {
        await expect(checkUserAllowedStudyView(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a member of the study', async () => {
        const { member2User1, study1 } = await insertRecords()
        mockClerkSession({ clerkUserId: member2User1.clerkId, org_slug: 'test-1' })
        await expect(checkUserAllowedStudyView(study1.id)).rejects.toThrow(AccessDeniedError)
    })
})

describe('checkMemberAllowedStudyReview', () => {
    it('allows the user when they are a reviewer for the study', async () => {
        const { study1, member1, member1User1 } = await insertRecords()
        mockClerkSession({ clerkUserId: member1User1.clerkId, org_slug: member1.slug })
        await expect(checkMemberAllowedStudyReview(study1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when studyId is not provided', async () => {
        await expect(checkMemberAllowedStudyReview(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a reviewer for the study', async () => {
        const { study1, member1, member1User2 } = await insertRecords()
        mockClerkSession({ clerkUserId: member1User2.clerkId, org_slug: member1.slug })
        await expect(checkMemberAllowedStudyReview(study1.id)).rejects.toThrow(AccessDeniedError)
    })
})

describe('getMemberUserPublicKey', () => {
    it('returns public key when userId is valid', async () => {
        const { member1User1 } = await insertRecords()
        const publicKey = await getMemberUserPublicKey(member1User1.id)
        expect(publicKey).not.toBeNull()
    })

    it('returns null when userId is invalid', async () => {
        const publicKey = await getMemberUserPublicKey(invalidUUID)
        expect(publicKey).toBeUndefined()
    })
})

describe('latestJobForStudy', () => {
    it('returns the latest job for a study', async () => {
        const { study1, job1 } = await insertRecords()
        const latestJob = await latestJobForStudy(study1.id)
        expect(latestJob).not.toBeNull()
        expect(latestJob?.id).toBe(job1.id)
    })

    it('returns null when studyId is invalid', async () => {
        const latestJob = await latestJobForStudy(invalidUUID)
        expect(latestJob).toBeUndefined()
    })
})

describe('jobInfoForJobId', () => {
    it('returns job info when jobId is valid', async () => {
        const { job1, member1 } = await insertRecords()
        const jobInfo = await jobInfoForJobId(job1.id)
        expect(jobInfo).not.toBeNull()
        expect(jobInfo?.studyJobId).toBe(job1.id)
        expect(jobInfo?.memberSlug).toBe(member1.slug)
    })

    it('throws an error when jobId is invalid', async () => {
        await expect(jobInfoForJobId('invalid-job-id')).rejects.toThrow()
    })
})

describe('studyInfoForStudyId', () => {
    it('returns study info when studyId is valid', async () => {
        const { study1, member1 } = await insertRecords()
        const studyInfo = await studyInfoForStudyId(study1.id)
        expect(studyInfo).not.toBeNull()
        expect(studyInfo?.studyId).toBe(study1.id)
        expect(studyInfo?.memberSlug).toBe(member1.slug)
    })

    it('returns null when studyId is invalid', async () => {
        const studyInfo = await studyInfoForStudyId(invalidUUID)
        expect(studyInfo).toBeUndefined()
    })
})

describe('getFirstOrganizationForUser', () => {
    it('returns the first organization for a user', async () => {
        const { member1User1, member1 } = await insertRecords()
        const organization = await getFirstOrganizationForUser(member1User1.id)
        expect(organization).not.toBeNull()
        expect(organization?.id).toBe(member1.id)
    })

    it('returns null when userId is invalid', async () => {
        const organization = await getFirstOrganizationForUser(invalidUUID)
        expect(organization).toBeUndefined()
    })
})

describe('getUsersByRoleAndMemberId', () => {
    it('returns users with role reviewer for a member', async () => {
        const { member1, member1User1 } = await insertRecords()
        const users = await getUsersByRoleAndMemberId('reviewer', member1.id)
        expect(users).not.toBeNull()
        expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ userId: member1User1.id })]))
    })

    it('returns users with role researcher for a member', async () => {
        const { member1, member1User2 } = await insertRecords()
        const users = await getUsersByRoleAndMemberId('researcher', member1.id)
        expect(users).not.toBeNull()
        expect(users).toEqual(expect.arrayContaining([expect.objectContaining({ userId: member1User2.id })]))
    })

    it('returns empty array when memberId is invalid', async () => {
        const users = await getUsersByRoleAndMemberId('researcher', invalidUUID)
        expect(users).toEqual([])
    })
})
