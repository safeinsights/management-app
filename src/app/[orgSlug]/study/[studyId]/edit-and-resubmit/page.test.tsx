// OTTER-497: the edit-and-resubmit page must be reachable by any member of the
// submitting lab (not only the original researcher), and must stay closed to
// users outside that lab.
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

        // a different member of the same lab opens the page
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

        // Access is gated on lab membership, not authorship: a same-lab teammate
        // reaches the rendered page instead of being bounced to notFound().
        expect(page).toBeDefined()
    })

    it('returns notFound for a user outside the submitting lab', async () => {
        const { org: labA, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        // a user from a different lab tries to open the page
        await mockSessionWithTestData({ orgType: 'lab' })

        // notFound() is a no-op mock in the test env (tests/vitest.setup.ts), so
        // a gated page resolves to undefined instead of rendering the form.
        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: labA.slug, studyId: study.id }),
        })

        expect(page).toBeUndefined()
    })
})
