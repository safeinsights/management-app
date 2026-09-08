import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent, within } from '@/tests/unit.helpers'
import { ProposalProvider, type ProposalDraftData } from '@/contexts/proposal'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { ProposalForm } from './form'
import { PI_SELECT_ID, textFieldInputId } from './field-ids'
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

const renderForm = (data: ProposalDraftData = draftData, props: Partial<Parameters<typeof ProposalForm>[0]> = {}) =>
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={data}>
            <ProposalForm
                members={[{ value: BLANK_UUID, label: 'Jane Smith' }]}
                orgName="Rice University"
                researcherName="Ada Lovelace"
                {...props}
            />
        </ProposalProvider>,
    )

describe('ProposalForm study title removal (OTTER-690)', () => {
    it('does not render a Study title field', () => {
        renderForm()

        expect(screen.queryByLabelText(/study title/i)).not.toBeInTheDocument()
        expect(screen.queryByText('Study title')).not.toBeInTheDocument()
    })

    it('still renders the fields this step does own', () => {
        renderForm()

        expect(screen.getByText('Dataset(s) of interest')).toBeInTheDocument()
        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
    })
})

describe('ProposalForm autosave announcements', () => {
    // Title, datasets and PI mirror one Yjs provider, so a live region on each would announce
    // "All changes saved" three times per save cycle.
    it('announces a save once for the whole fields form (OTTER-675)', () => {
        renderForm()
        expect(screen.getAllByTestId('autosave-announcer')).toHaveLength(1)
    })

    it('starts the announcement region empty, so the first save is announced (OTTER-675)', () => {
        renderForm()
        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()
    })
})

describe('ProposalForm section header and body copy (OTTER-691)', () => {
    it('reuses the shared section header with the Step 2 eyebrow and heading', () => {
        renderForm()

        const header = screen.getByTestId('proposal-section-header')
        expect(within(header).getByText('STEP 2')).toBeInTheDocument()
        expect(within(header).getByRole('heading', { name: 'Study proposal' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-header-divider')).toBeInTheDocument()
    })

    it('does not render the study title in the header', () => {
        renderForm()

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })

    it('renders the new body copy with the Data Partner interpolated', () => {
        renderForm()

        expect(
            screen.getByText(
                'Submit your proposal to Rice University for review. They will assess its feasibility, scientific value, and potential impact on instructional practice. After review, they may approve it, request revisions, or decline it.',
            ),
        ).toBeInTheDocument()
    })

    it('does not render the old body copy', () => {
        renderForm()

        expect(screen.queryByText(/Use this form to submit your study proposal/)).not.toBeInTheDocument()
    })
})

describe('ProposalForm datasets field (OTTER-691)', () => {
    it('renders the new description with the Data Partner interpolated', () => {
        renderForm()

        expect(
            screen.getByText('Select the datasets available through Rice University for this study.'),
        ).toBeInTheDocument()
    })

    it('does not render the old description', () => {
        renderForm()

        expect(screen.queryByText(/You’ll find options based on the selected Data Partner/)).not.toBeInTheDocument()
    })

    it('renders no placeholder text', () => {
        renderForm()

        expect(screen.queryByPlaceholderText(/Select dataset/i)).not.toBeInTheDocument()
    })
})

describe('ProposalForm researcher field (OTTER-691)', () => {
    it('shows the researcher name as static text, not an input', () => {
        renderForm()

        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
        expect(screen.queryByDisplayValue('Ada Lovelace')).not.toBeInTheDocument()
    })

    it('shows the guidance and the Update profile link to the draft creator', () => {
        renderForm(draftData, { isDraftCreator: true })

        expect(
            screen.getByText('Update your profile to share your research experience with Rice University.'),
        ).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Update profile/i })).toBeInTheDocument()
    })

    // Scoped to the draft creator, not any researcher: a co-author is a researcher too, and the
    // link edits the viewer's own profile.
    it('hides both from anyone who is not the draft creator', () => {
        renderForm(draftData, { isDraftCreator: false })

        expect(
            screen.queryByText('Update your profile to share your research experience with Rice University.'),
        ).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Update profile/i })).not.toBeInTheDocument()
    })

    it('no longer offers the old View profile link', () => {
        renderForm(draftData, { isDraftCreator: true })

        expect(screen.queryByRole('link', { name: /^View profile/i })).not.toBeInTheDocument()
    })
})

describe('ProposalForm submit-click validation (OTTER-691)', () => {
    const emptyDraft: ProposalFormValues = {
        ...draftData,
        datasets: [],
        piName: '',
        piUserId: '',
    }

    it('flags every empty required field at once, with the card wording', async () => {
        const user = userEvent.setup()
        renderForm(emptyDraft)

        await user.click(screen.getByRole('button', { name: 'Submit proposal' }))

        expect(await screen.findByText('Select a dataset of interest before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your research questions before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your project summary before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your proposal impact before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Select a Principal Investigator before continuing.')).toBeInTheDocument()
    })

    it('moves focus to the first flagged field in page order', async () => {
        const user = userEvent.setup()
        renderForm(emptyDraft)

        await user.click(screen.getByRole('button', { name: 'Submit proposal' }))

        expect(document.activeElement?.closest('#datasets')).not.toBeNull()
    })

    it('flags only the fields that are actually empty', async () => {
        const user = userEvent.setup()
        renderForm({ ...emptyDraft, datasets: ['dataset-1'] })

        await user.click(screen.getByRole('button', { name: 'Submit proposal' }))

        expect(await screen.findByText('Select a Principal Investigator before continuing.')).toBeInTheDocument()
        expect(screen.queryByText('Select a dataset of interest before continuing.')).not.toBeInTheDocument()
    })

    // A persisted NULL reaches the provider as `undefined`, which wins in an object spread and
    // blanks the matching initial value, yielding a zod type message instead of the card's copy.
    it('still uses the card wording when the draft has never been filled in', async () => {
        const user = userEvent.setup()
        renderForm({
            title: 'A study title',
            datasets: undefined,
            researchQuestions: undefined,
            projectSummary: undefined,
            impact: undefined,
            additionalNotes: undefined,
            piName: undefined,
            piUserId: undefined,
        })

        await user.click(screen.getByRole('button', { name: 'Submit proposal' }))

        expect(await screen.findByText('Select a dataset of interest before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your research questions before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your project summary before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Enter your proposal impact before continuing.')).toBeInTheDocument()
        expect(screen.getByText('Select a Principal Investigator before continuing.')).toBeInTheDocument()
    })
})

// Behind a null websocket the editors render as skeletons, so every jump stops at the dataset
// field; single-user mode renders the real surfaces the focus rule needs.
describe('ProposalForm first-invalid focus (OTTER-691)', () => {
    const filled = {
        researchQuestions: JSON.stringify({ root: { type: 'text', text: 'A question?' } }),
        projectSummary: JSON.stringify({ root: { type: 'text', text: 'A summary.' } }),
        impact: JSON.stringify({ root: { type: 'text', text: 'An impact.' } }),
    }

    const renderWithEditors = (data: ProposalDraftData) =>
        renderWithProviders(
            <YjsWebsocketProvider singleUserEditing>
                <ProposalProvider studyId={STUDY_ID} draftData={data}>
                    <ProposalForm
                        members={[{ value: BLANK_UUID, label: 'Jane Smith' }]}
                        orgName="Rice University"
                        researcherName="Ada Lovelace"
                    />
                </ProposalProvider>
            </YjsWebsocketProvider>,
        )

    const submit = async () => {
        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: 'Submit proposal' }))
    }

    it('lands on the first flagged editor when the fields above it are filled', async () => {
        renderWithEditors({ ...draftData, piName: 'Jane Smith', piUserId: BLANK_UUID })

        await submit()

        expect(document.activeElement?.id).toBe(textFieldInputId('researchQuestions'))
    })

    it('skips filled editors and lands on the flagged one below them', async () => {
        renderWithEditors({ ...draftData, ...filled, impact: '', piName: 'Jane Smith', piUserId: BLANK_UUID })

        await submit()

        expect(document.activeElement?.id).toBe(textFieldInputId('impact'))
    })

    it('lands on the PI select when it is the only flagged field', async () => {
        renderWithEditors({ ...draftData, ...filled, piName: '', piUserId: '' })

        await submit()

        expect(document.activeElement?.id).toBe(PI_SELECT_ID)
    })
})
