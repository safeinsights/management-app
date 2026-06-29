import { TextInput } from '@mantine/core'
import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { ProposalProvider, useProposal, type ProposalDraftData } from '@/contexts/proposal'
import { ProposalFooter } from './footer'
import { type ProposalFormValues } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function lexicalText(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}

// Every required field populated EXCEPT the title (left blank, as drafts now
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

// Test-only title input wired through useProposal so changes flow through the
// real Mantine form the footer reads.
const TitleInputProbe = () => {
    const { form } = useProposal()
    return <TextInput aria-label="Study Title Probe" {...form.getInputProps('title')} />
}

const renderFooter = (draftData: ProposalDraftData = fullyValidExceptTitle) =>
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={draftData}>
            <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
        </ProposalProvider>,
    )

describe('ProposalFooter submit gating (OTTER-557)', () => {
    it('keeps Submit disabled when the title is empty', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeDisabled()
    })

    it('keeps Submit disabled when the title is whitespace only', () => {
        renderFooter({ ...fullyValidExceptTitle, title: '   ' })
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeDisabled()
    })

    it('enables Submit when the researcher provides a real title', () => {
        renderFooter({ ...fullyValidExceptTitle, title: 'My Real Study Title' })
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeEnabled()
    })

    it('enables Submit after the researcher types a real title in the form input', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <ProposalProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <TitleInputProbe />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
            </ProposalProvider>,
        )

        const submit = screen.getByRole('button', { name: 'Submit initial request' })
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), 'My Real Study Title')

        expect(submit).toBeEnabled()
    })
})

describe('ProposalFooter save-as-draft dirty tracking', () => {
    const trackedFieldEdits: Array<[keyof ProposalFormValues, ProposalFormValues[keyof ProposalFormValues]]> = [
        ['title', 'A brand new title'],
        ['datasets', ['dataset-1', 'dataset-2']],
        ['piName', 'Dr. New Name'],
        ['piUserId', '22222222-2222-4222-8222-222222222222'],
    ]

    const lexicalFieldEdits: Array<[keyof ProposalFormValues, ProposalFormValues[keyof ProposalFormValues]]> = [
        ['researchQuestions', lexicalText('A different research question')],
        ['projectSummary', lexicalText('A different summary')],
        ['impact', lexicalText('A different impact statement')],
        ['additionalNotes', lexicalText('Some additional notes')],
    ]

    const FieldProbe = ({ field, value }: { field: keyof ProposalFormValues; value: unknown }) => {
        const { form } = useProposal()
        return (
            <button type="button" onClick={() => form.setFieldValue(field, value as never)}>
                Edit field
            </button>
        )
    }

    const renderWithFieldProbe = (field: keyof ProposalFormValues, value: unknown) =>
        renderWithProviders(
            <ProposalProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <FieldProbe field={field} value={value} />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
            </ProposalProvider>,
        )

    it('keeps Save as draft disabled before any changes', () => {
        renderWithFieldProbe('title', 'unused')
        expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled()
    })

    it.each(trackedFieldEdits)('enables Save as draft when draft-tracked field "%s" changes', async (field, value) => {
        const user = userEvent.setup()
        renderWithFieldProbe(field, value)

        await user.click(screen.getByRole('button', { name: 'Edit field' }))

        expect(screen.getByRole('button', { name: 'Save as draft' })).toBeEnabled()
    })

    it.each(lexicalFieldEdits)(
        'keeps Save as draft disabled when auto-saved editor field "%s" changes',
        async (field, value) => {
            const user = userEvent.setup()
            renderWithFieldProbe(field, value)

            await user.click(screen.getByRole('button', { name: 'Edit field' }))

            expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled()
        },
    )
})
