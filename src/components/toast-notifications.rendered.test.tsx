import { cssVariablesResolver, theme } from '@/theme'
import { MantineProvider } from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showToast } from './toast-notifications'

// The shared setup swaps this module for spies, which cannot show what the store actually renders.
vi.unmock('@mantine/notifications')

// The app theme, not a bare provider: the close button's accessible name comes from the theme's
// Notification override, so a default provider would not reproduce what users get.
const mount = () =>
    render(
        <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
            <Notifications />
        </MantineProvider>,
    )

describe('toast rendering', () => {
    beforeEach(() => notifications.clean())

    it('renders title, message and a close button', async () => {
        mount()
        showToast({ category: 'success', title: 'Saved', message: 'Education updated' })

        expect(await screen.findByText('Saved')).toBeVisible()
        expect(screen.getByText('Education updated')).toBeVisible()
        expect(screen.getByRole('button', { name: /close/i })).toBeVisible()
    })

    // Asserted on the real node, not a spied call argument: this is the hook e2e coverage reads the
    // category off, so it has to survive Mantine's prop forwarding.
    it('carries the category onto the rendered node', async () => {
        mount()
        showToast({ category: 'warning', title: 'Check your inputs' })

        expect(await screen.findByRole('status')).toHaveAttribute('data-toast-kind', 'warning')
    })

    it('marks an error assertive and everything else polite', async () => {
        mount()
        showToast({ category: 'error', title: 'Failed' })
        expect(await screen.findByRole('alert')).toHaveAttribute('aria-live', 'assertive')

        showToast({ category: 'info', title: 'Heads up' })
        expect(await screen.findByRole('status')).toHaveAttribute('aria-live', 'polite')
    })
})
