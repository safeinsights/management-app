import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { AppShell } from '@mantine/core'
import { AppFooter } from './app-footer'

const COPYRIGHT = `© ${new Date().getFullYear()} SafeInsights | Rice University`

describe('AppFooter', () => {
    it('renders the copyright as a footer landmark on in-app pages', () => {
        renderWithProviders(
            <AppShell>
                <AppFooter />
            </AppShell>,
        )

        expect(screen.getByRole('contentinfo')).toHaveTextContent(COPYRIGHT)
    })

    it('carries the same copyright on the dark footer of the focused screens', () => {
        renderWithProviders(
            <AppShell footer={{ height: 60 }}>
                <AppFooter isDark />
            </AppShell>,
        )

        expect(screen.getByRole('contentinfo')).toHaveTextContent(COPYRIGHT)
    })
})
