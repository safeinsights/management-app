import { setUserPublicKeyAction, updateUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Route } from 'next'
import router from 'next-router-mock'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateKeys } from './generate-keys'

vi.mock('si-encryption/util/keypair', () => ({
    generateKeyPair: vi.fn(),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    setUserPublicKeyAction: vi.fn(),
    updateUserPublicKeyAction: vi.fn(),
}))

const mockKeys = {
    publicKeyString: 'mockPublicKey',
    privateKeyString: 'mockPrivateKey',
    fingerprint: 'mockFingerprint',
    exportedPublicKey: new ArrayBuffer(8),
}

const mockClipboard = (succeed: boolean) => {
    const writeText = vi.fn(() => (succeed ? Promise.resolve() : Promise.reject(new Error('blocked'))))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
}

const renderPage = (props: { isRegenerating?: boolean; firstKeyRedirect?: Route } = {}) => {
    mockClerkSession({ userId: 'user-id', clerkUserId: 'clerk-user-id', orgSlug: 'dev' })
    vi.mocked(generateKeyPair).mockResolvedValue(mockKeys as never)
    renderWithProviders(<GenerateKeys {...props} />)
    return screen.findByText('Security key', { selector: 'h3' })
}

const storeKey = async () => {
    fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, I have stored my key' }))
}

describe('Security key generation', () => {
    beforeEach(() => {
        router.setCurrentUrl('/account/keys')
    })

    it('shows the generated key and reveals Next with a success indicator after copying', async () => {
        mockClipboard(true)
        await renderPage()

        expect(screen.getByText(/mockPrivateKey/)).toBeDefined()
        expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

        await waitFor(() => expect(screen.getByText('Copied!')).toBeDefined())
        expect(screen.getByRole('button', { name: 'Next' })).toBeDefined()
    })

    it('shows a fallback error but still reveals Next when the copy fails', async () => {
        mockClipboard(false)
        await renderPage()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

        await waitFor(() =>
            expect(screen.getByText(/Copy did not work\. Select the key above and copy it manually\./)).toBeDefined(),
        )
        expect(screen.queryByText('Copied!')).toBeNull()
        expect(screen.getByRole('button', { name: 'Next' })).toBeDefined()
    })

    it('opens the confirm modal on Next and Back closes it', async () => {
        mockClipboard(true)
        await renderPage()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        fireEvent.click(await screen.findByRole('button', { name: 'Next' }))

        expect(await screen.findByText('Have you stored your security key?')).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        await waitFor(() => expect(screen.queryByText('Have you stored your security key?')).toBeNull())
    })

    // OTTER-655: the guard entry point passes no redirect_url, which used to land a first key on
    // "My dashboard" instead of the inviting org.
    it('first-time generation saves the key and uses the resolved landing when no redirect_url is present', async () => {
        mockClipboard(true)
        await renderPage({ isRegenerating: false, firstKeyRedirect: '/openstax-lab/dashboard' as Route })

        await storeKey()

        await waitFor(() => {
            expect(setUserPublicKeyAction).toHaveBeenCalledWith(
                expect.objectContaining({ publicKey: mockKeys.exportedPublicKey }),
            )
        })
        await waitFor(() => expect(router.asPath).toBe('/openstax-lab/dashboard'))
    })

    it('an explicit redirect_url overrides the resolved landing', async () => {
        router.setCurrentUrl('/account/keys?redirect_url=%2Facme%2Fdashboard')
        mockClipboard(true)
        await renderPage({ isRegenerating: false, firstKeyRedirect: '/openstax-lab/dashboard' as Route })

        await storeKey()

        await waitFor(() => expect(router.asPath).toBe('/acme/dashboard'))
    })

    it('a reset updates the key and redirects to the personal dashboard', async () => {
        mockClipboard(true)
        await renderPage({ isRegenerating: true })

        await storeKey()

        await waitFor(() => {
            expect(updateUserPublicKeyAction).toHaveBeenCalledWith(
                expect.objectContaining({ publicKey: mockKeys.exportedPublicKey }),
            )
        })
        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
    })

    it('a reset ignores a stray redirect_url', async () => {
        router.setCurrentUrl('/account/keys?redirect_url=%2Facme%2Fdashboard')
        mockClipboard(true)
        await renderPage({ isRegenerating: true, firstKeyRedirect: '/openstax-lab/dashboard' as Route })

        await storeKey()

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
    })

    it('clears the failure message once a retried copy succeeds', async () => {
        const writeText = mockClipboard(false)
        await renderPage()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        await waitFor(() => expect(screen.getByText(/Copy did not work/)).toBeDefined())

        writeText.mockResolvedValueOnce(undefined as never)
        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

        await waitFor(() => expect(screen.getByText('Copied!')).toBeDefined())
        expect(screen.queryByText(/Copy did not work/)).toBeNull()
    })

    // A denied clipboard prompt can sit open indefinitely, so its rejection can arrive after a
    // later success; that stale result must not resurrect the failure message.
    it('ignores a copy result the user has already superseded', async () => {
        const writeText = mockClipboard(true)
        let rejectAbandonedAttempt = (_: Error) => {}
        writeText.mockImplementationOnce(
            () => new Promise((_, reject) => (rejectAbandonedAttempt = reject)) as Promise<void>,
        )
        await renderPage()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        await waitFor(() => expect(screen.getByText('Copied!')).toBeDefined())

        await act(async () => rejectAbandonedAttempt(new Error('prompt dismissed')))

        expect(screen.queryByText(/Copy did not work/)).toBeNull()
        expect(screen.getByText('Copied!')).toBeDefined()
    })

    it('clears the success indicator once a later copy fails', async () => {
        const writeText = mockClipboard(true)
        await renderPage()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        await waitFor(() => expect(screen.getByText('Copied!')).toBeDefined())

        writeText.mockRejectedValueOnce(new Error('blocked') as never)
        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

        await waitFor(() => expect(screen.getByText(/Copy did not work/)).toBeDefined())
        expect(screen.queryByText('Copied!')).toBeNull()
    })
})
