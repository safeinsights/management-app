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
        // StudyProposal calls useStudyRequest(); production wires that provider in the study
        // layout, which this render does not exercise.
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(<StudyRequestProvider submittingOrgSlug={org.slug}>{page!}</StudyRequestProvider>)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: /Save & continue/i })).toBeInTheDocument()
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

    // /edit is a revisitable step: it never resume-redirects to Step 2. resolveScreen, not this
    // page, decides the canonical screen.
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
        expect(screen.getByRole('button', { name: /Save & continue/i })).toBeInTheDocument()
    })
})
