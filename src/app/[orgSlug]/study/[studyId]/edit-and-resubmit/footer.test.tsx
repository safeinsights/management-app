import { TextInput } from '@mantine/core'
import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit } from '@/contexts/edit-resubmit'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { EditResubmitFooter } from './footer'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function lexicalText(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}

// Every required proposal field populated EXCEPT the title (left blank, as drafts now
// persist a NULL title instead of a placeholder; reproduces OTTER-557).
const fullyValidExceptTitle: ProposalFormValues = {
    title: '',
    datasets: ['dataset-1'],
    researchQuestions: lexicalText('What is the primary research question?'),
    projectSummary: lexicalText('This study examines outcomes.'),
    impact: lexicalText('Findings will inform practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

// A 60-word note (above the 50-word minimum) so the note form's validity
// doesn't get in the way of the title-gate assertions.
const VALID_NOTE = Array.from({ length: 60 }, (_, i) => `word${i + 1}`).join(' ')

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

const renderFooter = (draftData: ProposalFormValues = fullyValidExceptTitle, titleOverride?: string) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
            <FormProbes titleOverride={titleOverride} />
            <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
        </EditResubmitProvider>,
    )

describe('EditResubmitFooter submit gating (OTTER-557)', () => {
    it('keeps Resubmit disabled when the title is empty', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('keeps Resubmit disabled when the title is whitespace only', () => {
        renderFooter(fullyValidExceptTitle, '   ')
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('enables Resubmit when the researcher provides a real title', () => {
        renderFooter(fullyValidExceptTitle, 'My Real Study Title')
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
