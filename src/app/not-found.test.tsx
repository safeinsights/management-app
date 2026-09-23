import { describe, expect, it, mockClerkSession, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { MAIN_CONTENT_ID } from '@/lib/constants'
import { Routes } from '@/lib/routes'
import { NotFoundView } from './not-found-view'

describe('NotFoundView', () => {
    // Five routes redirect here, so the 404 screen needs the same focus target as the shells.
    it('renders main as the route-change focus target', () => {
        mockClerkSession(null)

        renderWithProviders(<NotFoundView />)

        const main = screen.getByRole('main')
        expect(main).toHaveAttribute('id', MAIN_CONTENT_ID)
        expect(main).toHaveAttribute('tabindex', '-1')
    })

    it('takes the user home', async () => {
        mockClerkSession(null)
        renderWithProviders(<NotFoundView />)

        await userEvent.click(screen.getByRole('button', { name: 'Take me back' }))

        expect(memoryRouter.asPath).toBe(Routes.home)
    })
})
