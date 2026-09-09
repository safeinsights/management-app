import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import {
    FAILURE_TITLE,
    OutputsDecisionFailureModal,
    RELOAD_HINT,
    SAVED_BODY,
    UNCONFIRMED_BODY,
    UNCONFIRMED_RELOAD_BODY,
    UNSAVED_BODY,
    UNSAVED_RELOAD_BODY,
    type OutputsDecisionFailure,
} from './outputs-decision-failure-modal'

const renderModal = (failure: OutputsDecisionFailure | null) => {
    const props = { failure, onDismiss: vi.fn(), onReload: vi.fn() }
    renderWithProviders(<OutputsDecisionFailureModal {...props} />)
    return props
}

describe('OutputsDecisionFailureModal', () => {
    it('renders no dialog when there is no failure', () => {
        renderModal(null)

        expect(screen.queryByText(FAILURE_TITLE)).not.toBeInTheDocument()
    })

    it('promises the save only when the feedback is confirmed stored', () => {
        renderModal({ cause: 'retry', saved: true })

        expect(screen.getByText(FAILURE_TITLE)).toBeInTheDocument()
        expect(screen.getByText(SAVED_BODY)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    it('says the work was not saved when the editor reports no completed write', () => {
        renderModal({ cause: 'retry', saved: false })

        expect(screen.getByText(UNSAVED_BODY)).toBeInTheDocument()
    })

    it('asks for a reload and warns about the security key when the client is stale', () => {
        renderModal({ cause: 'stale', saved: true })

        expect(screen.getByText(`${SAVED_BODY} ${RELOAD_HINT}`)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('tells the reviewer to copy the feedback before a reload it cannot protect', () => {
        renderModal({ cause: 'stale', saved: false })

        expect(screen.getByText(UNSAVED_RELOAD_BODY)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reload anyway' })).toBeInTheDocument()
    })

    // An editor that never reported a write is almost certainly an older build. Claiming the work
    // was lost would be a false alarm, and claiming it was saved would be the dishonesty the
    // persistence gate exists to prevent.
    it('claims neither outcome when the save cannot be confirmed', () => {
        renderModal({ cause: 'retry', saved: null })

        expect(screen.getByText(UNCONFIRMED_BODY)).toBeInTheDocument()
        expect(screen.queryByText(SAVED_BODY)).not.toBeInTheDocument()
        expect(screen.queryByText(UNSAVED_BODY)).not.toBeInTheDocument()
    })

    it('offers an honest reload when the save cannot be confirmed and the client is stale', () => {
        renderModal({ cause: 'stale', saved: null })

        const body = screen.getByText(UNCONFIRMED_RELOAD_BODY)
        expect(body).toBeInTheDocument()
        expect(body.textContent).not.toContain('is saved')
        expect(body.textContent).not.toContain('could not save')
        expect(screen.getByRole('button', { name: 'Reload anyway' })).toBeInTheDocument()
    })

    it('retries in place for an ordinary failure and never reloads', async () => {
        const props = renderModal({ cause: 'retry', saved: true })

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(props.onDismiss).toHaveBeenCalledOnce()
        expect(props.onReload).not.toHaveBeenCalled()
    })

    it('reloads for a stale client', async () => {
        const props = renderModal({ cause: 'stale', saved: true })

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(props.onReload).toHaveBeenCalledOnce()
    })

    it('reloads from the unconfirmed stale variant too', async () => {
        const props = renderModal({ cause: 'stale', saved: null })

        await userEvent.click(screen.getByRole('button', { name: 'Reload anyway' }))

        expect(props.onReload).toHaveBeenCalledOnce()
    })

    it('never shows framework error text', () => {
        renderModal({ cause: 'stale', saved: false })

        const dialog = screen.getByRole('dialog')
        expect(dialog.textContent).not.toContain('UnrecognizedActionError')
        expect(dialog.textContent).not.toContain('nextjs.org')
        expect(dialog.textContent).not.toContain('Reference:')
    })
})
