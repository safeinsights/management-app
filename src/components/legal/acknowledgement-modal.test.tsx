import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import type { PendingLegalDocument } from './acknowledgement-copy'
import { LegalAcknowledgementModal } from './acknowledgement-modal'

const document: PendingLegalDocument = {
    type: 'TOS',
    versionId: 'tos-v2',
    isUpdate: true,
    content: '# Terms\n\nThe updated terms.',
}

const renderModal = (props: Partial<Parameters<typeof LegalAcknowledgementModal>[0]> = {}) =>
    renderWithProviders(
        <LegalAcknowledgementModal
            isVisible
            document={document}
            isChecked={false}
            onCheckedChange={vi.fn()}
            onContinue={vi.fn()}
            onSignOut={vi.fn()}
            isSubmitting={false}
            error={null}
            {...props}
        />,
    )

describe('LegalAcknowledgementModal', () => {
    it('renders nothing when there is nothing outstanding', () => {
        renderModal({ isVisible: false })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows the document and says it was updated', () => {
        renderModal()

        expect(screen.getByText('The updated terms.')).toBeInTheDocument()
        expect(screen.getByText(/The Terms of Service has been updated/)).toBeInTheDocument()
    })

    it('keeps Continue disabled while the box is unchecked', () => {
        renderModal()
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    })

    it('enables Continue once the box is checked', () => {
        renderModal({ isChecked: true })
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    })

    // Mantine's `loading` blocks pointer clicks without setting `disabled`, so the button stays
    // keyboard-focusable and Enter would fire a second write mid-flight.
    it('keeps Continue disabled while a submission is in flight', () => {
        renderModal({ isChecked: true, isSubmitting: true })
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    })

    it('reports the checkbox being ticked', async () => {
        const onCheckedChange = vi.fn()
        const user = userEvent.setup()
        renderModal({ onCheckedChange })

        await user.click(screen.getByRole('checkbox'))

        expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('acknowledges when Continue is pressed', async () => {
        const onContinue = vi.fn()
        const user = userEvent.setup()
        renderModal({ isChecked: true, onContinue })

        await user.click(screen.getByRole('button', { name: 'Continue' }))

        expect(onContinue).toHaveBeenCalled()
    })

    // Declining is a legitimate choice, and the modal covers the nav — without this the only way out
    // is closing the tab, which leaves the session intact.
    it('offers signing out as the alternative to agreeing', async () => {
        const onSignOut = vi.fn()
        const user = userEvent.setup()
        renderModal({ onSignOut })

        await user.click(screen.getByRole('button', { name: 'Sign out' }))

        expect(onSignOut).toHaveBeenCalled()
    })

    it('cannot be dismissed', () => {
        renderModal()
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    })
})
