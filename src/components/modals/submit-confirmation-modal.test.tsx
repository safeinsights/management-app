import { describe, expect, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { SubmitConfirmationModal } from './submit-confirmation-modal'

const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Submit your proposal?',
    body: 'Your proposal will be sent to Rice University for review.',
    confirmLabel: 'Submit proposal',
}

const confirmButton = (name: string | RegExp) => screen.getByRole('button', { name })

describe('SubmitConfirmationModal', () => {
    it('renders the title, body and both buttons', () => {
        renderWithProviders(<SubmitConfirmationModal {...props} />)

        expect(screen.getByText('Submit your proposal?')).toBeInTheDocument()
        expect(screen.getByText(props.body)).toBeInTheDocument()
        expect(confirmButton('Cancel')).toBeEnabled()
        expect(confirmButton('Submit proposal')).toBeEnabled()
    })

    describe('while submitting, with a loading label', () => {
        const renderSubmitting = () =>
            renderWithProviders(<SubmitConfirmationModal {...props} isSubmitting confirmLoadingLabel="Submitting" />)

        it('swaps the label and disables both buttons', () => {
            renderSubmitting()

            expect(confirmButton('Submitting')).toBeDisabled()
            expect(confirmButton('Cancel')).toBeDisabled()
            expect(screen.queryByRole('button', { name: 'Submit proposal' })).not.toBeInTheDocument()
        })

        // Mantine's `loading` overlays the Loader on the label, leaving the accessible name
        // intact, so a name-based assertion would pass on a blank button.
        it("does not use Mantine's label-covering loading treatment", () => {
            renderSubmitting()

            expect(confirmButton('Submitting')).not.toHaveAttribute('data-loading')
        })

        it('shows a spinner beside the label', () => {
            renderSubmitting()

            // document, not the container: Mantine renders the modal into a portal.
            expect(document.querySelector('[class*="mantine-Loader"]')).toBeInTheDocument()
        })
    })

    it('takes a body of several paragraphs without nesting them in a paragraph', () => {
        renderWithProviders(
            <SubmitConfirmationModal
                {...props}
                body={
                    <>
                        <p>First paragraph.</p>
                        <p>Second paragraph.</p>
                    </>
                }
            />,
        )

        expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
        expect(document.querySelector('p p')).toBeNull()
    })

    it('styles the confirm button as destructive for the error variant', () => {
        renderWithProviders(<SubmitConfirmationModal {...props} variant="error" />)

        expect(confirmButton('Submit proposal')).toHaveAttribute('data-variant', 'error')
    })

    it('keeps the confirm label beside the spinner when no loading label is given', () => {
        renderWithProviders(<SubmitConfirmationModal {...props} isSubmitting />)

        expect(confirmButton('Submit proposal')).toBeDisabled()
        expect(confirmButton('Submit proposal')).not.toHaveAttribute('data-loading')
        expect(document.querySelector('[class*="mantine-Loader"]')).toBeInTheDocument()
    })
})
