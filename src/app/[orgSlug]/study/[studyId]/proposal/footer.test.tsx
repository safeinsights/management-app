import { TextInput } from '@mantine/core'
import { BLANK_UUID, describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { ProposalProvider, useProposal, type ProposalDraftData } from '@/contexts/proposal'
import { ProposalFooter } from './footer'
import { DEFAULT_DRAFT_TITLE, type ProposalFormValues } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function lexicalText(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}

// Every required field populated EXCEPT the title (which holds the
// server-assigned DEFAULT_DRAFT_TITLE placeholder, reproducing OTTER-557).
const fullyValidExceptTitle: ProposalFormValues = {
    title: DEFAULT_DRAFT_TITLE,
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
    it('keeps Submit disabled when only the default draft title is present', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Submit study proposal' })).toBeDisabled()
    })

    it('keeps Submit disabled when the title is whitespace only', () => {
        renderFooter({ ...fullyValidExceptTitle, title: '   ' })
        expect(screen.getByRole('button', { name: 'Submit study proposal' })).toBeDisabled()
    })

    it('enables Submit when the researcher provides a real title', () => {
        renderFooter({ ...fullyValidExceptTitle, title: 'My Real Study Title' })
        expect(screen.getByRole('button', { name: 'Submit study proposal' })).toBeEnabled()
    })

    it('enables Submit after the researcher types a real title in the form input', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <ProposalProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <TitleInputProbe />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
            </ProposalProvider>,
        )

        const submit = screen.getByRole('button', { name: 'Submit study proposal' })
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), 'My Real Study Title')

        expect(submit).toBeEnabled()
    })
})
