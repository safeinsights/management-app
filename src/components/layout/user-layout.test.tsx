import { Routes } from '@/lib/routes'
import { beforeEach, describe, expect, it, mockClerkSession, mockSessionWithTestData, vi } from '@/tests/unit.helpers'
import { redirect } from 'next/navigation'
import { UserLayout } from './user-layout'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
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

    it('renders for an account with MFA and a key', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        await expect(renderLayout()).resolves.toBeTruthy()

        expect(mockRedirect).not.toHaveBeenCalled()
    })
})
