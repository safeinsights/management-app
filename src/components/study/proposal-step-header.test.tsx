import { describe, expect, it, renderWithProviders, screen, within } from '@/tests/unit.helpers'
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

    it('renders an action opposite the heading', () => {
        renderWithProviders(
            <ProposalStepHeader stepLabel="STEP 3" heading="Edit code" action={<button>Launch IDE</button>} />,
        )

        const header = screen.getByTestId('proposal-section-header')
        expect(within(header).getByRole('button', { name: 'Launch IDE' })).toBeInTheDocument()
        expect(within(header).getByRole('heading', { name: 'Edit code', level: 2 })).toBeInTheDocument()
    })

    // The rule separates the header from content below it, and an action sits inside the header row.
    it('draws no rule for an action alone', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 3" heading="Edit code" action={<button>Go</button>} />)

        expect(screen.queryByTestId('proposal-header-divider')).not.toBeInTheDocument()
    })

    it('never renders a study title line', () => {
        renderWithProviders(<ProposalStepHeader stepLabel="STEP 1" heading="Set up study" />)

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })
})
