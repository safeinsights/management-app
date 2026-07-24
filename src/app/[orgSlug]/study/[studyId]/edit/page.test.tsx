import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirect, useParams } from 'next/navigation'
import { StudyRequestProvider } from '@/contexts/study-request'
import {
    db,
    insertTestStudyJobData,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import { writeProposalSubmissionSnapshot } from '@/server/db/proposal-snapshot'
import StudyEditPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string) =>
    StudyEditPage({ params: Promise.resolve({ orgSlug, studyId }) })

const setupDraft = async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'DRAFT',
        jobStatus: 'JOB-READY',
    })
    return { org, user, study }
}

const LEXICAL_BODY = JSON.stringify({ root: { children: [{ type: 'paragraph', children: [] }] } })

describe('StudyEditPage', () => {
    it('renders the Step 1 form when the draft has no Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        // <StudyProposal /> calls useStudyRequest(); production wires the provider in
        // /[orgSlug]/study/layout.tsx (which the test render does not exercise).
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(<StudyRequestProvider submittingOrgSlug={org.slug}>{page!}</StudyRequestProvider>)

        expect(mockRedirect).not.toHaveBeenCalled()
        // The Step 1 form's "Proceed to Step 2" footer button is the cheapest, most stable proof
        // that we rendered <StudyProposal /> (Step 1) rather than redirecting away.
        expect(screen.getByRole('button', { name: /Proceed to Step 2/i })).toBeInTheDocument()
    })

    // OTTER-636: a revision draft (DRAFT with a base snapshot) is edited on the lab-gated
    // edit-and-resubmit flow, not this un-gated Step-1 route, so it must redirect there instead of
    // rendering live revision content.
    it('redirects a revision draft to the edit-and-resubmit flow', async () => {
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

        // redirect() is mocked to throw NEXT_REDIRECT (see beforeEach), so the route rejects.
        await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining(`/study/${study.id}/edit-and-resubmit`))
    })

    it('shows the not-found message for non-DRAFT studies', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByText(/Only studies that are in DRAFT status can be edited/i)).toBeInTheDocument()
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    // /edit is a revisitable step: it always renders Step 1 for an authorized DRAFT researcher and
    // never resume-redirects to Step 2, regardless of how far the draft has progressed. The screen
    // authority (resolveScreen) — not this page — decides the canonical screen.
    it('renders Step 1 even when the draft has Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        const { user: piUser } = await insertTestUser({ org })
        await db
            .updateTable('study')
            .set({ piUserId: piUser.id, datasets: ['students'], researchQuestions: JSON.parse(LEXICAL_BODY) })
            .where('id', '=', study.id)
            .execute()
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(<StudyRequestProvider submittingOrgSlug={org.slug}>{page!}</StudyRequestProvider>)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /Proceed to Step 2/i })).toBeInTheDocument()
    })
})
