import { useState } from 'react'
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { SubmitOutputsDecisionModal, confirmationBody } from './submit-outputs-decision-modal'
import type { OutputsDecision } from '@/lib/outputs-review'

const LAB = 'Rice Lab'

const SHARE_OUTPUTS_BODY =
    'You are sharing the output files and your feedback with Rice Lab. You will not be able to make changes after submitting.'
const FEEDBACK_ONLY_BODY =
    'You are sharing your feedback only. The output files will not be shared with Rice Lab. You will not be able to make changes after submitting.'

const renderModal = (decision: OutputsDecision | null, overrides: Record<string, unknown> = {}) => {
    const props = {
        decision,
        labName: LAB,
        isOpen: true,
        isSubmitting: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        ...overrides,
    }
    renderWithProviders(<SubmitOutputsDecisionModal {...props} />)
    return props
}

describe('SubmitOutputsDecisionModal', () => {
    it('renders the title and all three controls', () => {
        renderModal('share-outputs')

        expect(screen.getByText('Submit your decision?')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit decision' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('states that the files and feedback are being shared for the share-outputs path', () => {
        renderModal('share-outputs')
        expect(screen.getByText(SHARE_OUTPUTS_BODY)).toBeInTheDocument()
    })

    it('states that the files are withheld for the feedback-only path', () => {
        renderModal('share-feedback-only')
        expect(screen.getByText(FEEDBACK_ONLY_BODY)).toBeInTheDocument()
    })

    it('interpolates the lab name into both bodies', () => {
        expect(confirmationBody('share-outputs', 'Acme Lab')).toContain('Acme Lab')
        expect(confirmationBody('share-feedback-only', 'Acme Lab')).toContain('Acme Lab')
    })

    it('stays closed until a decision has been picked', () => {
        renderModal(null)
        expect(screen.queryByText('Submit your decision?')).toBeNull()
    })

    it('stays closed when isOpen is false', () => {
        renderModal('share-outputs', { isOpen: false })
        expect(screen.queryByText('Submit your decision?')).toBeNull()
    })

    // Mantine keeps modal children mounted, so a cached body from the previously chosen option is
    // exactly what a screen reader would re-announce on the next open. Driven through a real
    // close → change → reopen cycle rather than a prop rerender, because a stale body would
    // survive precisely that sequence.
    it('shows the updated body after the decision changes between opens', async () => {
        const Harness = () => {
            const [decision, setDecision] = useState<OutputsDecision>('share-outputs')
            const [isOpen, setIsOpen] = useState(true)
            return (
                <>
                    <button onClick={() => setIsOpen(false)}>close it</button>
                    <button
                        onClick={() => {
                            setDecision('share-feedback-only')
                            setIsOpen(true)
                        }}
                    >
                        reopen with feedback only
                    </button>
                    <SubmitOutputsDecisionModal
                        decision={decision}
                        labName={LAB}
                        isOpen={isOpen}
                        isSubmitting={false}
                        onClose={() => setIsOpen(false)}
                        onConfirm={vi.fn()}
                    />
                </>
            )
        }

        renderWithProviders(<Harness />)
        expect(screen.getByText(SHARE_OUTPUTS_BODY)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'close it' }))
        await userEvent.click(screen.getByRole('button', { name: 'reopen with feedback only' }))

        expect(screen.getByText(FEEDBACK_ONLY_BODY)).toBeInTheDocument()
        expect(screen.queryByText(SHARE_OUTPUTS_BODY)).toBeNull()
    })

    it('closes without submitting from Cancel', async () => {
        const { onClose, onConfirm } = renderModal('share-outputs')

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('closes without submitting from the X', async () => {
        const { onClose, onConfirm } = renderModal('share-outputs')

        await userEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('closes on Escape', async () => {
        const { onClose } = renderModal('share-outputs')

        await userEvent.keyboard('{Escape}')

        expect(onClose).toHaveBeenCalled()
    })

    it('submits from the confirm button', async () => {
        const { onConfirm } = renderModal('share-outputs')

        await userEvent.click(screen.getByRole('button', { name: 'Submit decision' }))

        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('exposes itself as a modal dialog labelled by its title', () => {
        renderModal('share-outputs')

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveAccessibleName('Submit your decision?')
    })

    it('disables Cancel while the submission is in flight', () => {
        renderModal('share-outputs', { isSubmitting: true })

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
})
