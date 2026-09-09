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

    it('never renders a study title line', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })

    it('renders the timestamp without a study title line', () => {
        renderWithProviders(
            <ProposalStepHeader
                stepLabel="STEP 3"
                heading="Review outputs"
                timestampDate="2026-08-12"
                timestampLabel="Submitted on"
            />,
        )

        expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Submitted on Aug 12, 2026')
        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })
})
