import { TextInput } from '@mantine/core'
import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit, type EditResubmitDraftData } from '@/contexts/edit-resubmit'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { lexicalJson } from '@/lib/lexical'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { EditResubmitFooter } from './footer'
import { RESUBMIT_NOTE_MIN_WORDS } from './schema'

function NoteSection({ orgName }: { orgName: string }) {
    const { noteForm } = useEditResubmit()
    return <ResubmissionNoteSection noteForm={noteForm} orgName={orgName} />
}

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

// Pre-fill the proposal-side of the form so `form.isValid()` is true and the
// title gate is satisfied. This isolates the note gate from the proposal-form
// gate (and from OTTER-557's title check).
const VALID_PROPOSAL_DRAFT: EditResubmitDraftData = {
    title: 'A valid title',
    datasets: ['some-dataset'],
    researchQuestions: lexicalJson('Some research questions'),
    projectSummary: lexicalJson('A project summary'),
    impact: lexicalJson('Some impact'),
    piName: 'PI Name',
    piUserId: '22222222-2222-4222-8222-222222222222',
}

const renderFooterWithNoteSection = (draft: EditResubmitDraftData = VALID_PROPOSAL_DRAFT) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draft}>
            <NoteSection orgName="Rice University" />
            <EditResubmitFooter researcherName="Test Researcher" researcherId="" />
        </EditResubmitProvider>,
    )

describe('EditResubmitFooter — note gating (OTTER-521)', () => {
    // Regression: an earlier implementation seeded `useForm({ initialErrors })`
    // for the note form because Mantine doesn't validate initial values. The
    // seed itself rendered a concatenated error blob on first paint, and was
    // also unnecessary — `noteForm.isValid()` re-runs the schema against
    // current values on demand, so the empty-note case is already covered.
    it('disables Resubmit on first paint when the resubmission note is empty, even if the proposal form is otherwise valid', () => {
        renderFooterWithNoteSection()
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeDisabled()
    })

    it('enables Resubmit once a valid note is pasted and the proposal form is valid', async () => {
        const user = userEvent.setup()
        renderFooterWithNoteSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste(wordsString(RESUBMIT_NOTE_MIN_WORDS))
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeEnabled()
    })
})

// Every required proposal field populated EXCEPT the title (left blank, as drafts now
// persist a NULL title instead of a placeholder; reproduces OTTER-557).
const fullyValidExceptTitle: ProposalFormValues = {
    title: '',
    datasets: ['dataset-1'],
    researchQuestions: lexicalJson('What is the primary research question?'),
    projectSummary: lexicalJson('This study examines outcomes.'),
    impact: lexicalJson('Findings will inform practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

// A 60-word note (above the 50-word minimum) so the note form's validity
// doesn't get in the way of the title-gate assertions.
const VALID_NOTE = wordsString(60)

// Test-only probe that primes the note form with a valid value so we can
// isolate the title-gate behavior under test.
const FormProbes = ({ titleOverride }: { titleOverride?: string }) => {
    const { form, noteForm } = useEditResubmit()
    if (noteForm.values.resubmissionNote !== VALID_NOTE) {
        noteForm.setFieldValue('resubmissionNote', VALID_NOTE)
    }
    if (titleOverride !== undefined && form.values.title !== titleOverride) {
        form.setFieldValue('title', titleOverride)
    }
    return null
}

const TitleInputProbe = () => {
    const { form } = useEditResubmit()
    return <TextInput aria-label="Study Title Probe" {...form.getInputProps('title')} />
}

const renderFooterWithTitleProbes = (draftData: ProposalFormValues = fullyValidExceptTitle, titleOverride?: string) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
            <FormProbes titleOverride={titleOverride} />
            <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
        </EditResubmitProvider>,
    )

describe('EditResubmitFooter — title gating (OTTER-557)', () => {
    it('keeps Resubmit disabled when the title is empty', () => {
        renderFooterWithTitleProbes()
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('keeps Resubmit disabled when the title is whitespace only', () => {
        renderFooterWithTitleProbes(fullyValidExceptTitle, '   ')
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('enables Resubmit when the researcher provides a real title', () => {
        renderFooterWithTitleProbes(fullyValidExceptTitle, 'My Real Study Title')
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeEnabled()
    })

    it('enables Resubmit after the researcher types a real title in the form input', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <FormProbes />
                <TitleInputProbe />
                <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
            </EditResubmitProvider>,
        )

        const submit = screen.getByRole('button', { name: 'Resubmit initial request' })
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), 'My Real Study Title')

        expect(submit).toBeEnabled()
    })
})
