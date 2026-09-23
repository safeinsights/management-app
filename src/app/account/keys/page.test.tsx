import {
    db,
    faker,
    fireEvent,
    insertTestOrg,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import router from 'next-router-mock'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import KeysPage from './page'

// Spread the original: si-encryption/util is a barrel, so a bare factory would blank out the key
// helpers used below.
vi.mock('si-encryption/util/keypair', async (importOriginal) => ({
    ...(await importOriginal<typeof import('si-encryption/util/keypair')>()),
    generateKeyPair: vi.fn(),
}))

// The landing resolver stays real: the point is that the page wires it into the redirect
// (OTTER-655). The stand-in is a real SPKI key because the action validates the bytes.
const renderKeysPage = async (confirmLabel = 'Yes, I have stored my key') => {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.resolve()) },
        configurable: true,
    })

    const exportedPublicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    vi.mocked(generateKeyPair).mockResolvedValue({
        privateKeyString: 'test-private-key',
        fingerprint: await fingerprintKeyData(exportedPublicKey),
        exportedPublicKey,
    } as never)

    const page = await KeysPage()
    renderWithProviders(page)
    await screen.findByText('Security key', { selector: 'h3' })

    fireEvent.click(screen.getByRole('button', { name: /copy key/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: confirmLabel }))
}

describe('KeysPage', () => {
    it('lands a keyless single-org account on that org dashboard with no redirect_url', async () => {
        router.setCurrentUrl('/account/keys')
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        await renderKeysPage()

        await waitFor(() => expect(router.asPath).toBe(`/${org.slug}/dashboard`))
    })

    it('lands a keyless multi-org account on My dashboard, since no org is unambiguous', async () => {
        router.setCurrentUrl('/account/keys')
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const otherOrg = await insertTestOrg({ slug: faker.string.alpha(10) })
        await db.insertInto('orgUser').values({ userId: user.id, orgId: otherOrg.id, isAdmin: false }).execute()

        await renderKeysPage()

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
    })

    // OTTER-741: a direct visit by an account that already holds a key is a reset, and must say so.
    it('walks a key holder through the reset warning and replaces the stored key', async () => {
        router.setCurrentUrl('/account/keys')
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })

        await renderKeysPage('Yes, replace my key')

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
        const key = await db
            .selectFrom('userPublicKey')
            .select('fingerprint')
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(key.fingerprint).not.toBe('testFingerprint1')
    })
})
