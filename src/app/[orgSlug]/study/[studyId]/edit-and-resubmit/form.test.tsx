import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent, within } from '@/tests/unit.helpers'
import { EditResubmitProvider, type EditResubmitDraftData } from '@/contexts/edit-resubmit'
import { lexicalJson } from '@/lib/lexical'
import { DRAFT_REQUIRED_ERRORS } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { DATASETS_FIELD_ID, PI_SELECT_ID, textFieldInputId } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { PROPOSAL_REQUIRED_NOTE_ERROR, RESUBMISSION_NOTE_FIELD_ID } from './schema'
import { EditResubmitForm } from './form'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const ORG_NAME = 'Rice University'

const filledDraft: EditResubmitDraftData = {
    title: 'A study title',
    datasets: ['dataset-1'],
    researchQuestions: lexicalJson('A question?'),
    projectSummary: lexicalJson('A summary.'),
    impact: lexicalJson('An impact.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

const emptyDraft: EditResubmitDraftData = {
    ...filledDraft,
    datasets: [],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    piName: '',
    piUserId: '',
}

// Behind a null websocket the editors render as skeletons, and the note's error box sits inside
// the editor's footer; single-user mode renders the real surfaces the focus rule needs.
const renderForm = (draft: EditResubmitDraftData, initialNote = '') =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draft} initialNote={initialNote}>
            <EditResubmitForm
                header={null}
                orgName={ORG_NAME}
                members={[{ value: BLANK_UUID, label: 'Jane Smith' }]}
                researcherName="Ada Lovelace"
                researcherId="researcher-1"
                feedbackEntries={[]}
                noteVersion={2}
                initialNote={initialNote}
            />
        </EditResubmitProvider>,
        { singleUserEditing: true },
    )

const clickResubmit = async () => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Resubmit proposal' }))
}

describe('EditResubmitForm resubmit-click validation (OTTER-762)', () => {
    it('flags every empty required field at once, the note included, with the card wording', async () => {
        renderForm(emptyDraft)

        await clickResubmit()

        expect(await screen.findByText(DRAFT_REQUIRED_ERRORS.datasets)).toBeInTheDocument()
        expect(screen.getByText(DRAFT_REQUIRED_ERRORS.researchQuestions)).toBeInTheDocument()
        expect(screen.getByText(DRAFT_REQUIRED_ERRORS.projectSummary)).toBeInTheDocument()
        expect(screen.getByText(DRAFT_REQUIRED_ERRORS.impact)).toBeInTheDocument()
        expect(screen.getByText(DRAFT_REQUIRED_ERRORS.piName)).toBeInTheDocument()
        expect(screen.getByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('flags only the fields that are actually empty', async () => {
        renderForm({ ...emptyDraft, datasets: ['dataset-1'] })

        await clickResubmit()

        expect(await screen.findByText(DRAFT_REQUIRED_ERRORS.piName)).toBeInTheDocument()
        expect(screen.queryByText(DRAFT_REQUIRED_ERRORS.datasets)).not.toBeInTheDocument()
    })

    it('exposes each flagged field to assistive tech, not only the first', async () => {
        renderForm(emptyDraft)

        await clickResubmit()
        await screen.findByText(DRAFT_REQUIRED_ERRORS.datasets)

        const flagged = [
            DATASETS_FIELD_ID,
            textFieldInputId('researchQuestions'),
            textFieldInputId('projectSummary'),
            textFieldInputId('impact'),
            PI_SELECT_ID,
            RESUBMISSION_NOTE_FIELD_ID,
        ]
        for (const id of flagged) {
            expect(document.getElementById(id)).toHaveAttribute('aria-invalid', 'true')
        }
    })
})

describe('EditResubmitForm first-invalid focus (OTTER-762)', () => {
    it('moves focus to the first flagged field in page order', async () => {
        renderForm(emptyDraft)

        await clickResubmit()

        await screen.findByText(DRAFT_REQUIRED_ERRORS.datasets)
        expect(document.activeElement?.closest(`#${DATASETS_FIELD_ID}`)).not.toBeNull()
    })

    it('skips filled fields and lands on the flagged editor below them', async () => {
        renderForm({ ...filledDraft, impact: '' }, 'A note already written.')

        await clickResubmit()

        await screen.findByText(DRAFT_REQUIRED_ERRORS.impact)
        expect(document.activeElement?.id).toBe(textFieldInputId('impact'))
    })

    it('lands on the resubmission note when it is the only flagged field', async () => {
        renderForm(filledDraft)

        await clickResubmit()

        await screen.findByText(PROPOSAL_REQUIRED_NOTE_ERROR)
        expect(document.activeElement?.id).toBe(RESUBMISSION_NOTE_FIELD_ID)
    })

    it('opens the confirmation modal once every field, the note included, is valid', async () => {
        renderForm(filledDraft, 'Addressed the reviewer feedback.')

        await clickResubmit()

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Resubmit your proposal?')).toBeInTheDocument()
    })
})

describe('EditResubmitForm resubmission note (OTTER-762)', () => {
    it('renders the note editor without placeholder text', () => {
        renderForm(filledDraft)

        expect(screen.queryByText(/Summarize the modifications made to your initial request/)).not.toBeInTheDocument()
    })
})
