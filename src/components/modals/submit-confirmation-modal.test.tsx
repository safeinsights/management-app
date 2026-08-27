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
        renderWithProviders(<SubmitConfirmationModal {...props} isSubmitting={false} />)

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

        /**
         * The regression this exists for: the loading state was first built with Mantine's
         * `loading` prop, which renders the Loader as a centered overlay *on top of* the label and
         * marks the button `data-loading`. The accessible name stayed "Submitting", so a
         * name-based assertion passed while the button rendered as a blank rectangle on screen.
         * Asserting the attribute is absent pins the mechanism, not just the text.
         */
        it("does not use Mantine's label-covering loading treatment", () => {
            renderSubmitting()

            expect(confirmButton('Submitting')).not.toHaveAttribute('data-loading')
        })

        it('shows a spinner beside the label', () => {
            renderSubmitting()

            // document, not the render container: Mantine renders the modal into a portal.
            expect(document.querySelector('[class*="mantine-Loader"]')).toBeInTheDocument()
        })
    })

    // Callers that never pass a loading label (the Step 1 "Continue to the next step?" modal) keep
    // the default treatment, so this change stays scoped to the proposal submit modal.
    it("keeps Mantine's default loading treatment when no loading label is given", () => {
        renderWithProviders(<SubmitConfirmationModal {...props} isSubmitting />)

        expect(confirmButton('Submit proposal')).toHaveAttribute('data-loading', 'true')
    })
})
