import { redirect } from 'next/navigation'
import {
    beforeEach,
    createTestProposalDraft,
    db,
    describe,
    expect,
    it,
    setTestStudyStatus,
    vi,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import StudyProposalRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string) =>
    StudyProposalRoute({ params: Promise.resolve({ orgSlug, studyId }) })

/**
 * Guards the redirect that lets everything downstream stop branching on status (OTTER-690).
 *
 * ProposalProvider passes a reduced collaborative key set, the DRAFT resolver and `titleMode:
 * 'omit'` unconditionally, all of which are wrong for a CHANGE-REQUESTED study. They are safe
 * only because this route never serves one. If this test goes, so does that guarantee.
 */
describe('StudyProposalRoute status routing', () => {
    it('renders the Step 2 editor for a DRAFT', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-draft' })

        await renderRoute(lab.slug, studyId)

        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('sends a CHANGE-REQUESTED study to the page built for it', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-cr' })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyEditAndResubmit({ orgSlug: lab.slug, studyId }))
    })

    // A draft predating OTTER-690 can have a NULL title, and this page has no field to set one.
    // Step 1 owns the title and stays revisitable, so it is the only place the draft can be made
    // submittable again.
    it('sends a DRAFT with no title back to Step 1', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-untitled' })
        await db.updateTable('study').set({ title: null }).where('id', '=', studyId).execute()

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyEdit({ orgSlug: lab.slug, studyId }))
    })

    it('sends a submitted study to the review screen', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-approved' })
        await setTestStudyStatus(studyId, 'APPROVED')

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: lab.slug, studyId }))
    })
})
