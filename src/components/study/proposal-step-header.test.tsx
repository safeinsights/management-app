import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ProposalStepHeader } from './proposal-step-header'

describe('ProposalStepHeader', () => {
    it('renders the step label and heading', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.getByText('STEP 1')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Set up study', level: 2 })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-header-divider')).toBeInTheDocument()
    })

    it('omits the title line when no studyTitle is passed', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })

    // Guards the OTTER-666 call sites: making studyTitle optional must not stop the steps that
    // pass one from rendering it.
    it('still renders the title line when a studyTitle is passed', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 3" heading="Review outputs" studyTitle="My study" />)

        expect(screen.getByText('Title: My study')).toBeInTheDocument()
    })

    it('renders an empty title line for a blank studyTitle, as before', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 3" heading="Review outputs" studyTitle="" />)

        expect(screen.getByText(/^Title:/)).toBeInTheDocument()
    })

    it('renders the timestamp beside the title', () => {
        renderWithProviders(
            <ProposalStepHeader
                stepLabel="STEP 3"
                heading="Review outputs"
                studyTitle="My study"
                timestampDate="2026-08-12"
                timestampLabel="Submitted on"
            />,
        )

        expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Submitted on Aug 12, 2026')
    })
})
