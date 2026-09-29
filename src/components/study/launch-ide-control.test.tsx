import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { LaunchIdeControl } from './launch-ide-control'

/**
 * Replaces launch-ide-button.test.tsx: OTTER-693 folded that component into this one, so the label
 * pair ("Launch IDE" / "Edit files in IDE") and the inline launching and failed states it asserted
 * are gone. Failures now surface through IdeLaunchFailedModal, which the mounting card owns.
 */
describe('LaunchIdeControl', () => {
    const baseProps = {
        isClaimed: false,
        canLaunch: true,
        ideOwnerName: null,
        isLaunching: false,
        onLaunch: vi.fn(),
    }

    it('renders one label whatever the claim state', () => {
        const { unmount } = renderWithProviders(<LaunchIdeControl {...baseProps} />)
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        unmount()

        renderWithProviders(<LaunchIdeControl {...baseProps} isClaimed />)
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
    })

    it('launches on click', async () => {
        const onLaunch = vi.fn()
        renderWithProviders(<LaunchIdeControl {...baseProps} onLaunch={onLaunch} />)

        await userEvent.setup().click(screen.getByRole('button', { name: /launch ide/i }))
        expect(onLaunch).toHaveBeenCalledTimes(1)
    })

    it('warns that launching takes the lock, only while nobody holds it', () => {
        const { unmount } = renderWithProviders(<LaunchIdeControl {...baseProps} />)
        expect(screen.getByText(/launching locks the ide to you/i)).toBeInTheDocument()
        unmount()

        renderWithProviders(<LaunchIdeControl {...baseProps} isClaimed />)
        expect(screen.queryByText(/launching locks the ide to you/i)).not.toBeInTheDocument()
    })

    it('disables and names the holder when someone else has it', () => {
        renderWithProviders(<LaunchIdeControl {...baseProps} isClaimed canLaunch={false} ideOwnerName="Ada Lovelace" />)

        expect(screen.getByRole('button', { name: /launch ide/i })).toBeDisabled()
    })

    it('renders nothing when hidden', () => {
        renderWithProviders(<LaunchIdeControl {...baseProps} isVisible={false} />)
        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
    })
})
