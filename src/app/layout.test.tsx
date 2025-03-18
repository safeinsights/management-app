import { describe, it, vi, expect, beforeEach, Mock } from 'vitest'
import { currentUser } from '@clerk/nextjs/server'
import RootLayout from './layout'
import { redirect } from 'next/navigation'

vi.mock('@clerk/nextjs/server', () => ({
    currentUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
}))

const user = currentUser as unknown as Mock

describe('RootLayout MFA redirect', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('redirects to MFA setup if twoFactorEnabled is false', async () => {
        user.mockResolvedValue({ twoFactorEnabled: false })

        await RootLayout({ children: <div>Test</div> })

        expect(redirect).toHaveBeenCalledWith('/account/mfa')
    })

    it('does not redirect if twoFactorEnabled is true', async () => {
        user.mockResolvedValue({ twoFactorEnabled: true })

        await RootLayout({ children: <div>Test</div> })

        expect(redirect).not.toHaveBeenCalled()
    })

    it('does not redirect if user is null', async () => {
        user.mockResolvedValue(null)

        await RootLayout({ children: <div>Test</div> })

        expect(redirect).not.toHaveBeenCalled()
    })
})
