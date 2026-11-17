import { globalAcknowledgementUrl } from '@/lib/global-acknowledgement-redirect'
import { Routes } from '@/lib/routes'
import {
    beforeEach,
    describe,
    expect,
    insertTestLegalDocument,
    it,
    mockClerkSession,
    mockSessionWithTestData,
    resetLegalDocuments,
    vi,
} from '@/tests/unit.helpers'
import { redirect } from 'next/navigation'
import { UserLayout } from './user-layout'

const mockRedirect = vi.mocked(redirect)

// A seeded Terms of Service would otherwise send every account here to the acknowledgement step.
beforeEach(async () => {
    await resetLegalDocuments()
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_user_layout')
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderLayout = () => UserLayout({ children: null })

describe('UserLayout', () => {
    it('sends a signed-out visitor to sign in', async () => {
        mockClerkSession(null)

        await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.accountSignin)
    })

    // 'lab' accounts are keyless, so this proves MFA wins over the key check.
    it('sends an account without MFA to MFA setup before key setup', async () => {
        await mockSessionWithTestData({ orgType: 'lab', twoFactorEnabled: false })

        await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledTimes(1)
        expect(mockRedirect).toHaveBeenCalledWith(Routes.accountMfa)
    })

    it('sends a keyless account with MFA to key setup', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('sends a keyless account owing the Terms of Service to key setup first', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await insertTestLegalDocument({ type: 'TOS', publishedBy: user.id })

        await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledTimes(1)
        expect(mockRedirect).toHaveBeenCalledWith(Routes.accountKeys)
    })

    it('sends an account with MFA and a key that owes the Terms of Service to the acknowledgement step', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await insertTestLegalDocument({ type: 'TOS', publishedBy: user.id })

        await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(globalAcknowledgementUrl(Routes.dashboard))
    })

    it('renders for an account with MFA and a key', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        await expect(renderLayout()).resolves.toBeTruthy()

        expect(mockRedirect).not.toHaveBeenCalled()
    })
})
