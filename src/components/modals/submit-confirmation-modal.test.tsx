import { describe, expect, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { resubmitCodeModalCopy, submitCodeModalCopy } from '@/app/[orgSlug]/study/[studyId]/proposal/copy'
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

    it("keeps Mantine's default loading treatment when no loading label is given", () => {
        renderWithProviders(<SubmitConfirmationModal {...props} isSubmitting />)

        expect(confirmButton('Submit proposal')).toHaveAttribute('data-loading', 'true')
    })

    // OTTER-955: the code step names the pending action, like the proposal modals already do.
    it.each([
        ['Submit code', submitCodeModalCopy, 'Submitting'],
        ['Edit code', resubmitCodeModalCopy, 'Resubmitting'],
    ])('labels the pending %s confirmation', (_page, copy, pendingLabel) => {
        renderWithProviders(<SubmitConfirmationModal {...props} {...copy('Rice University')} isSubmitting compact />)

        expect(confirmButton(pendingLabel)).toBeDisabled()
    })
})
