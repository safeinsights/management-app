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
import { STUDY_TITLE_MAX_CHARACTERS } from '@/app/[orgSlug]/study/request/form-schemas'
import StudyProposalRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string) =>
    StudyProposalRoute({ params: Promise.resolve({ orgSlug, studyId }) })

// ProposalProvider unconditionally passes the DRAFT resolver and `titleMode: 'omit'`, which are
// wrong for a CHANGE-REQUESTED study and safe only because of this redirect (OTTER-690).
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

    // This page has no title field, so a NULL-titled draft can only be fixed on Step 1.
    it('sends a DRAFT with no title back to Step 1', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-untitled' })
        await db.updateTable('study').set({ title: null }).where('id', '=', studyId).execute()

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyEdit({ orgSlug: lab.slug, studyId }))
    })

    // A draft predating the OTTER-737 cap can hold an over-long title Step 2 cannot shorten, so
    // the submit would be rejected against a field that is not on the page.
    it('sends a DRAFT whose stored title is over the cap back to Step 1', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-long-title' })
        await db
            .updateTable('study')
            .set({ title: 'x'.repeat(STUDY_TITLE_MAX_CHARACTERS + 10) })
            .where('id', '=', studyId)
            .execute()

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyEdit({ orgSlug: lab.slug, studyId }))
    })

    it('renders the Step 2 editor for a title exactly at the cap', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-cap-title' })
        await db
            .updateTable('study')
            .set({ title: 'x'.repeat(STUDY_TITLE_MAX_CHARACTERS) })
            .where('id', '=', studyId)
            .execute()

        await renderRoute(lab.slug, studyId)

        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('sends a submitted study to the review screen', async () => {
        const { lab, studyId } = await createTestProposalDraft({ enclaveSlug: 'proposal-route-approved' })
        await setTestStudyStatus(studyId, 'APPROVED')

        await expect(renderRoute(lab.slug, studyId)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: lab.slug, studyId }))
    })
})
