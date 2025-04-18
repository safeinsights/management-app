import { describe, it, expect } from 'vitest'
import { insertTestMember, insertTestStudyJobUsers, mockClerkSession } from '@/tests/unit.helpers'
import { checkUserAllowedJobView, checkUserAllowedStudyView, checkMemberAllowedStudyReview } from './queries'
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
