// OTTER-497: reachable by any member of the submitting lab, closed to everyone outside it.
import { describe, it, expect } from 'vitest'
import { insertTestStudyJobData, insertTestUser, mockClerkSession, mockSessionWithTestData } from '@/tests/unit.helpers'
import StudyEditAndResubmitRoute from './page'

describe('StudyEditAndResubmitRoute', () => {
    it('renders for a same-lab member who is not the original researcher', async () => {
        const { org, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const { user: teammate } = await insertTestUser({ org })
        mockClerkSession({
            userId: teammate.id,
            clerkUserId: teammate.clerkId,
            email: teammate.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'lab',
        })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        expect(page).toBeDefined()
    })

    it('returns notFound for a user outside the submitting lab', async () => {
        const { org: labA, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        await mockSessionWithTestData({ orgType: 'lab' })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: labA.slug, studyId: study.id }),
        })

        expect(page).toBeUndefined()
    })
})
