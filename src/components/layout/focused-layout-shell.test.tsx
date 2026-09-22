import { expect, it } from 'vitest'
import { FocusedLayoutShell } from './focused-layout-shell'
import { screen } from '@testing-library/react'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'

it('renders without a user', async () => {
    mockClerkSession(null)

    renderWithProviders(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
    )

    await screen.findByText('hello world')
})

// The library scopes surface/sidenav to frame fills; the shell painted purple.8, a rung the
// design never named, on every screen.
it('paints the shell frame from the sidenav token', async () => {
    mockClerkSession(null)

    renderWithProviders(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
    )

    await screen.findByText('hello world')
    const header = document.querySelector('.mantine-AppShell-header')
    const main = document.querySelector('.mantine-AppShell-main')
    expect(header?.getAttribute('style')).toContain('--si-color-surface-sidenav')
    expect(main?.getAttribute('style')).toContain('--si-color-surface-sidenav')
})
