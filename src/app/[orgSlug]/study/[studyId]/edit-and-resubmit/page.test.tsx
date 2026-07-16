// OTTER-497: the edit-and-resubmit page must be reachable by any member of the
// submitting lab (not only the original researcher), and must stay closed to
// users outside that lab.
import { describe, it, expect } from 'vitest'
import {
    db,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { writeProposalSubmissionSnapshot } from '@/server/db/proposal-snapshot'
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

    // OTTER-636: the first edit flips a change-requested proposal to a revision DRAFT (a DRAFT with a
    // base snapshot). That draft must keep rendering the revision editor rather than bouncing.
    it('renders for a revision draft (DRAFT with a base snapshot)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'CHANGE-REQUESTED',
        })
        await writeProposalSubmissionSnapshot(db, study.id, user.id)
        const snap = await db
            .selectFrom('studyProposalSubmission')
            .select('id')
            .where('studyId', '=', study.id)
            .executeTakeFirstOrThrow()
        await db
            .updateTable('study')
            .set({ status: 'DRAFT', proposalRevisionBaseSubmissionId: snap.id })
            .where('id', '=', study.id)
            .execute()

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        expect(page).toBeDefined()
    })

    // A fresh DRAFT (no base snapshot) belongs to the /proposal editor, not here.
    it('returns notFound for a fresh draft (DRAFT without a base snapshot)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        expect(page).toBeUndefined()
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
