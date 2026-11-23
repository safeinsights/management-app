import { describe, expect, it, mockClerkSession, renderWithProviders, screen } from '@/tests/unit.helpers'
import { MAIN_CONTENT_ID } from '@/lib/constants'
import { ErrorScreen } from './error-boundary'

describe('ErrorScreen', () => {
    it('focuses its main and retitles the tab on mount, like the 404 screen', () => {
        mockClerkSession(null)

        renderWithProviders(<ErrorScreen eventId="evt-123" />)

        const main = screen.getByRole('main')
        expect(main).toHaveAttribute('id', MAIN_CONTENT_ID)
        expect(main).toHaveFocus()
        expect(document.title).toBe('Something went wrong - SafeInsights')
        expect(screen.getByText('Error ID: evt-123')).toBeInTheDocument()
    })
})
