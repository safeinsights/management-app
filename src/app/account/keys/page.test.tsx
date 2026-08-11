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

// Spread the original: si-encryption/util is a barrel over this module, so a bare factory would
// also blank out the key helpers this file uses to build the stand-in below.
vi.mock('si-encryption/util/keypair', async (importOriginal) => ({
    ...(await importOriginal<typeof import('si-encryption/util/keypair')>()),
    generateKeyPair: vi.fn(),
}))

// Only the key pair and the clipboard are mocked: this test exists to prove the page wires the
// resolved landing into the redirect, which the prop-injecting component tests cannot show
// (OTTER-655), so setUserPublicKeyAction and the landing resolver stay real. The stand-in is a real
// SPKI key rather than a stub because the action validates the bytes it is handed; generating a
// fresh 4096-bit pair per test would put a random multi-hundred-millisecond cost on every run.
const renderKeysPage = async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, I have stored my key' }))
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
})
