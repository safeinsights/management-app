import { db, mockSessionWithTestData, readTestSupportFile, renderWithProviders } from '@/tests/unit.helpers'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Route } from 'next'
import router from 'next-router-mock'
import { generateKeyPair, pemToArrayBuffer } from 'si-encryption/util/keypair'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateKeys, postKeyRedirect } from './generate-keys'

// Only generation is faked: the saving actions fingerprint the key with this module's real helpers.
vi.mock('si-encryption/util/keypair', async (importOriginal) => ({
    ...(await importOriginal<typeof import('si-encryption/util/keypair')>()),
    generateKeyPair: vi.fn(),
}))

const mockKeys = {
    publicKeyString: 'mockPublicKey',
    privateKeyString: 'mockPrivateKey',
    fingerprint: 'mockFingerprint',
}

const mockClipboard = (succeed: boolean) => {
    const writeText = vi.fn(() => (succeed ? Promise.resolve() : Promise.reject(new Error('blocked'))))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
}

// The saving actions validate the key server-side, so the generated pair carries a real public key.
// Only enclave members get a key from the fixtures, which is what a reset needs to replace.
const renderPage = async (props: { isRegenerating?: boolean; firstKeyRedirect?: Route } = {}) => {
    const { user } = await mockSessionWithTestData({ orgType: props.isRegenerating ? 'enclave' : 'lab' })
    const exportedPublicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    vi.mocked(generateKeyPair).mockResolvedValue({ ...mockKeys, exportedPublicKey } as never)
    renderWithProviders(<GenerateKeys {...props} />)
    await screen.findByRole('heading', { level: 1, name: /security key/i })
    return { user, exportedPublicKey }
}

const storedKey = (userId: string) =>
    db.selectFrom('userPublicKey').select(['publicKey', 'fingerprint']).where('userId', '=', userId).executeTakeFirst()

const storeKey = async (confirmLabel = 'Yes, I have stored my key') => {
    fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: confirmLabel }))
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
        expect(screen.queryByText('Confirm key reset')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        await waitFor(() => expect(screen.queryByText('Have you stored your security key?')).toBeNull())
    })

    // OTTER-655: the guard entry point passes no redirect_url, which used to land a first key on
    // "My studies" instead of the inviting org.
    it('first-time generation saves the key and uses the resolved landing when no redirect_url is present', async () => {
        mockClipboard(true)
        const { user, exportedPublicKey } = await renderPage({
            isRegenerating: false,
            firstKeyRedirect: '/openstax-lab/dashboard' as Route,
        })

        await storeKey()

        await waitFor(() => expect(router.asPath).toBe('/openstax-lab/dashboard'))
        expect((await storedKey(user.id))?.publicKey).toEqual(Buffer.from(exportedPublicKey))
    })

    it('an explicit redirect_url overrides the resolved landing', async () => {
        router.setCurrentUrl('/account/keys?redirect_url=%2Facme%2Fdashboard')
        mockClipboard(true)
        await renderPage({ isRegenerating: false, firstKeyRedirect: '/openstax-lab/dashboard' as Route })

        await storeKey()

        await waitFor(() => expect(router.asPath).toBe('/acme/dashboard'))
    })

    // OTTER-741: a key holder reaching this route directly used to read a first-time setup and a
    // modal that warned only about losing the new key.
    it('describes a reset with the /user-key warning in the body and the confirm modal', async () => {
        mockClipboard(true)
        const { user } = await renderPage({ isRegenerating: true })
        const keyBefore = await storedKey(user.id)

        expect(screen.getByRole('heading', { level: 1, name: 'New security key' })).toBeDefined()
        expect(screen.getByText(/It replaces your existing key\./)).toBeDefined()
        expect(screen.getByText(/A new key cannot decrypt your current outputs\. It works only/).tagName).toBe('B')
        expect(screen.queryByText(/This is your security key\. You will need it/)).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
        fireEvent.click(await screen.findByRole('button', { name: 'Next' }))

        expect(await screen.findByText('Confirm key reset')).toBeDefined()
        expect(screen.getByText(/those outputs will be lost\. This action cannot be undone\./)).toBeDefined()
        expect(screen.queryByText('Have you stored your security key?')).toBeNull()
        expect(screen.getByRole('button', { name: 'Yes, replace my key' })).toBeDefined()
        expect(await storedKey(user.id)).toEqual(keyBefore)
    })

    it('a reset updates the key and redirects to the personal dashboard', async () => {
        mockClipboard(true)
        const { user, exportedPublicKey } = await renderPage({ isRegenerating: true })

        await storeKey('Yes, replace my key')

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
        expect((await storedKey(user.id))?.publicKey).toEqual(Buffer.from(exportedPublicKey))
    })

    it('a reset ignores a stray redirect_url', async () => {
        router.setCurrentUrl('/account/keys?redirect_url=%2Facme%2Fdashboard')
        mockClipboard(true)
        await renderPage({ isRegenerating: true, firstKeyRedirect: '/openstax-lab/dashboard' as Route })

        await storeKey('Yes, replace my key')

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

describe('postKeyRedirect', () => {
    const fallback = '/openstax-lab/dashboard' as Route

    // OTTER-788. searchParams.get() hands safeRedirectUrl an already-decoded path, and the linking
    // screen takes no query of its own, so the key detour forwards to it untouched.
    it('forwards a first key to the email-linking screen', () => {
        const linkEmail = '/account/invitation/019f38c6-804c-70ac-b02a-a4b87d432bc2/link-email'

        expect(postKeyRedirect(false, linkEmail, fallback)).toBe(linkEmail)
    })

    it('sends a regenerated key to the dashboard rather than the linking screen', () => {
        expect(postKeyRedirect(true, '/account/invitation/abc/link-email', fallback)).toBe('/dashboard')
    })
})
