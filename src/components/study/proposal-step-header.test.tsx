import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ProposalStepHeader } from './proposal-step-header'

describe('ProposalStepHeader', () => {
    it('renders the step label and heading', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.getByText('STEP 1')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Set up study', level: 2 })).toBeInTheDocument()
    })

    it('rules off the header when something follows it in the card', () => {
        renderWithProviders(
            <ProposalStepHeader stepLabel="STEP 1" heading="Set up study" banner={<p>Banner copy</p>} />,
        )

        expect(screen.getByTestId('proposal-header-divider')).toBeInTheDocument()
    })

    it('leaves no rule behind when the banner renders nothing', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 2" heading="Initial request" banner={null} />)

        expect(screen.queryByTestId('proposal-header-divider')).not.toBeInTheDocument()
    })

    it('omits the title line when no studyTitle is passed', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })

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
