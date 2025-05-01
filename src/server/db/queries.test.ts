import { describe, it, expect } from 'vitest'
import { insertTestOrg, insertTestStudyJobUsers, mockClerkSession } from '@/tests/unit.helpers'
import { checkUserAllowedJobView, checkUserAllowedStudyView, checkUserAllowedStudyReview } from './queries'
import { AccessDeniedError } from '@/lib/errors'

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

describe('checkUserAllowedJobView', () => {
    it('allows the user when they are a org of the study owning the job', async () => {
        const { job1, org1User1, org1 } = await insertRecords()
        mockClerkSession({ clerkUserId: org1User1.clerkId, org_slug: org1.slug })
        await expect(checkUserAllowedJobView(job1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when jobId is not provided', async () => {
        await expect(checkUserAllowedJobView(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a org of the study owning the job', async () => {
        const { org2User1, job1, org2 } = await insertRecords()
        mockClerkSession({ clerkUserId: org2User1.clerkId, org_slug: org2.slug })
        await expect(checkUserAllowedJobView(job1.id)).rejects.toThrow(AccessDeniedError)
    })
})

describe('checkUserAllowedStudyView', () => {
    it('allows the user when they are a org of the study', async () => {
        const { study1, org1, org1User1 } = await insertRecords()
        mockClerkSession({ clerkUserId: org1User1.clerkId, org_slug: org1.slug })
        await expect(checkUserAllowedStudyView(study1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when studyId is not provided', async () => {
        await expect(checkUserAllowedStudyView(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a org of the study', async () => {
        const { org2User1, study1 } = await insertRecords()
        mockClerkSession({ clerkUserId: org2User1.clerkId, org_slug: 'test-1' })
        await expect(checkUserAllowedStudyView(study1.id)).rejects.toThrow(AccessDeniedError)
    })
})

describe('checkOrgAllowedStudyReview', () => {
    it('allows the user when they are a reviewer for the study', async () => {
        const { study1, org1, org1User1 } = await insertRecords()
        mockClerkSession({ clerkUserId: org1User1.clerkId, org_slug: org1.slug })
        await expect(checkUserAllowedStudyReview(study1.id)).resolves.toBe(true)
    })

    it('throws AccessDeniedError when studyId is not provided', async () => {
        await expect(checkUserAllowedStudyReview(undefined)).rejects.toThrow(AccessDeniedError)
    })

    it('throws AccessDeniedError when the user is not a reviewer for the study', async () => {
        const { study1, org1, org1User2 } = await insertRecords()
        mockClerkSession({ clerkUserId: org1User2.clerkId, org_slug: org1.slug })
        await expect(checkUserAllowedStudyReview(study1.id)).rejects.toThrow(AccessDeniedError)
    })
})
