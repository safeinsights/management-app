import { it } from 'vitest'
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
