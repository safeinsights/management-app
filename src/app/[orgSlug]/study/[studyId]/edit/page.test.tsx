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
import StudyEditPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string, searchParams: { from?: string } = {}) =>
    StudyEditPage({ params: Promise.resolve({ orgSlug, studyId }), searchParams: Promise.resolve(searchParams) })

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

    describe('redirects to Step 2 when the draft has Step 2 progress', () => {
        it('redirects when a PI user has been selected', async () => {
            const { org, study } = await setupDraft()
            const { user: piUser } = await insertTestUser({ org })
            await db.updateTable('study').set({ piUserId: piUser.id }).where('id', '=', study.id).execute()

            await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
            expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/proposal`)
        })

        it('redirects when datasets have been picked', async () => {
            const { org, study } = await setupDraft()
            await db
                .updateTable('study')
                .set({ datasets: ['students'] })
                .where('id', '=', study.id)
                .execute()

            await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
            expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/proposal`)
        })

        it.each(['researchQuestions', 'projectSummary', 'impact', 'additionalNotes'] as const)(
            'redirects when %s has been saved',
            async (field) => {
                const { org, study } = await setupDraft()
                await db
                    .updateTable('study')
                    .set({ [field]: JSON.parse(LEXICAL_BODY) })
                    .where('id', '=', study.id)
                    .execute()

                await expect(renderRoute(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
                expect(mockRedirect).toHaveBeenCalledWith(`/${org.slug}/study/${study.id}/proposal`)
            },
        )
    })

    // Step 2's "Previous" footer button saves the form (which writes Step-2 fields) then
    // navigates here with ?from=step2. Without this override, the draftHasStep2Progress
    // check would bounce the researcher right back to /proposal — the page they were
    // trying to leave — creating a dead Previous button.
    it('renders Step 1 when arriving from Step 2 Previous, even with Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        const { user: piUser } = await insertTestUser({ org })
        await db
            .updateTable('study')
            .set({ piUserId: piUser.id, datasets: ['students'] })
            .where('id', '=', study.id)
            .execute()
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        const page = await renderRoute(org.slug, study.id, { from: 'step2' })
        renderWithProviders(<StudyRequestProvider submittingOrgSlug={org.slug}>{page!}</StudyRequestProvider>)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /Proceed to Step 2/i })).toBeInTheDocument()
    })
})
