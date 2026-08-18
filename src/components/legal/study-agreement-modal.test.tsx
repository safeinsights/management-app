import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { StudyAgreementModal } from './study-agreement-modal'

const DOWNLOAD_URL = 'https://example.com/agreement.pdf'

const renderModal = (props: Partial<Parameters<typeof StudyAgreementModal>[0]> = {}) =>
    renderWithProviders(
        <StudyAgreementModal
            isVisible
            downloadUrl={DOWNLOAD_URL}
            isChecked={false}
            onCheckedChange={vi.fn()}
            onContinue={vi.fn()}
            onCancel={vi.fn()}
            isSubmitting={false}
            error={null}
            {...props}
        />,
    )

describe('StudyAgreementModal', () => {
    it('renders nothing when nothing is outstanding', () => {
        renderModal({ isVisible: false })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('links out to the agreement in a new tab, since it is a PDF', () => {
        renderModal()

        const link = screen.getByRole('link', { name: /Study Agreement/ })
        expect(link).toHaveAttribute('href', DOWNLOAD_URL)
        expect(link).toHaveAttribute('target', '_blank')
    })

    it('keeps Continue disabled until the box is checked', () => {
        renderModal()
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    })

    it('enables Continue once checked', () => {
        renderModal({ isChecked: true })
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    })

    it('reports the checkbox change so consent can be keyed to the version on screen', async () => {
        const onCheckedChange = vi.fn()
        renderModal({ onCheckedChange })

        await userEvent.click(screen.getByRole('checkbox'))

        expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('acknowledges on Continue', async () => {
        const onContinue = vi.fn()
        renderModal({ isChecked: true, onContinue })

        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(onContinue).toHaveBeenCalled()
    })

    // The modal covers the nav, so refusing has to lead somewhere.
    it('offers a way out that is not agreeing', async () => {
        const onCancel = vi.fn()
        renderModal({ onCancel })

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onCancel).toHaveBeenCalled()
    })

    it('cannot be dismissed', () => {
        renderModal()
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    })

    it('shows a failed acknowledgement', () => {
        renderModal({ error: 'could not be recorded' })
        expect(screen.getByText('could not be recorded')).toBeInTheDocument()
    })
})
