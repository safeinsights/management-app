import { describe, expect, it, mockClerkSession, renderWithProviders, screen } from '@/tests/unit.helpers'
import { MAIN_CONTENT_ID } from '@/lib/constants'
import { AppShell } from './app-shell'

describe('AppShell', () => {
    // useRouteFocus finds main by this id, and tabindex -1 is what lets a landmark take focus.
    it('renders main as the route-change focus target', () => {
        mockClerkSession(null)

        renderWithProviders(
            <AppShell>
                <div>page</div>
            </AppShell>,
        )

        const main = screen.getByRole('main')
        expect(main).toHaveAttribute('id', MAIN_CONTENT_ID)
        expect(main).toHaveAttribute('tabindex', '-1')
    })
})
