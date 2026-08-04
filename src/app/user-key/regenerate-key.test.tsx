import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import router from 'next-router-mock'
import { describe, expect, it } from 'vitest'
import { RegenerateKey } from './regenerate-key'

describe('Security key page', () => {
    const renderPage = () => {
        mockClerkSession({ clerkUserId: 'user-id', orgSlug: 'dev', userId: 'user-id' })
        renderWithProviders(<RegenerateKey generatedOn="Jul 08, 2026" />)
    }

    it('renders both sections with the generated date', async () => {
        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Security key', { selector: 'h1' })).toBeDefined()
        })
        expect(screen.getByText('Existing security key')).toBeDefined()
        expect(screen.getByText('Lost access to your key?')).toBeDefined()
        expect(screen.getByText(/You generated a security key on Jul 08, 2026\./)).toBeDefined()
        expect(screen.getByText(/A new key cannot decrypt your current outputs\./).tagName).toBe('B')
    })

    it('opens the confirm modal and cancelling leaves the page intact', async () => {
        renderPage()

        fireEvent.click(await screen.findByRole('button', { name: /generate new key/i }))

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText(/confirm key reset/i)).toBeDefined()
        expect(within(dialog).getByText(/those outputs will be lost/i)).toBeDefined()

        fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

        await waitFor(() => {
            expect(screen.queryByText(/confirm key reset/i)).toBeNull()
        })
        expect(router.asPath).not.toBe('/account/keys')
    })

    it('confirming redirects to the key generation flow', async () => {
        renderPage()

        fireEvent.click(await screen.findByRole('button', { name: /generate new key/i }))

        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: /generate new key/i }))

        await waitFor(() => {
            expect(router.asPath).toBe('/account/keys')
        })
    })
})
