import { BLANK_UUID, describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ProposalProvider, type ProposalDraftData } from '@/contexts/proposal'
import { ProposalForm } from './form'
import { type ProposalFormValues } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const draftData: ProposalFormValues = {
    title: 'A study title',
    datasets: ['dataset-1'],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

const renderForm = (data: ProposalDraftData = draftData) =>
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={data}>
            <ProposalForm members={[{ value: BLANK_UUID, label: 'Jane Smith' }]} orgName="Rice University" />
        </ProposalProvider>,
    )

describe('ProposalForm autosave announcements', () => {
    // Title, datasets and PI all mirror one Yjs provider, so a live region on each would have a
    // screen reader read "All changes saved" three times per save cycle. The isolated save-status
    // tests cannot catch that; only the assembled page can. Counted by the announcer's own testid
    // rather than page-wide: the collaborative text editors below own separate providers, so their
    // regions are correct, and they mount asynchronously behind an ssr:false import.
    it('announces a save once for the whole fields form (OTTER-675)', () => {
        renderForm()
        expect(screen.getAllByTestId('autosave-announcer')).toHaveLength(1)
    })

    it('starts the announcement region empty, so the first save is announced (OTTER-675)', () => {
        renderForm()
        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()
    })
})
