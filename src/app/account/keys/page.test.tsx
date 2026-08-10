import {
    db,
    faker,
    fireEvent,
    insertTestOrg,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import router from 'next-router-mock'
import KeysPage from './page'

// Nothing is mocked but the clipboard: this test exists to prove the page wires the resolved
// landing into the redirect, which the prop-injecting component tests cannot show (OTTER-655).
// That means real key generation and a real setUserPublicKeyAction, which validates the SPKI bytes
// it is handed and would reject a stub.
const renderKeysPage = async () => {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.resolve()) },
        configurable: true,
    })

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
