import { it, vi, expect, type Mock } from 'vitest'
import { currentUser } from '@clerk/nextjs/server'
import RootLayout from './layout'
import { redirect } from 'next/navigation'
import { render } from '@testing-library/react'

vi.mock('./providers', () => ({
    Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/layout/app-layout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const user = currentUser as unknown as Mock

it('redirects to MFA setup if twoFactorEnabled is false', async () => {
    user.mockResolvedValue({ twoFactorEnabled: false })

    render(await RootLayout({ children: <div>Test</div> }), { container: document })

    expect(redirect).toHaveBeenCalledWith('/account/mfa')
})

it('does not redirect if twoFactorEnabled is true', async () => {
    user.mockResolvedValue({ twoFactorEnabled: true })

    render(await RootLayout({ children: <div>Test</div> }), { container: document })

    expect(redirect).not.toHaveBeenCalled()
})

it('does not redirect if user is null', async () => {
    user.mockResolvedValue(null)
    render(await RootLayout({ children: <div>Test</div> }), { container: document })
    expect(redirect).not.toHaveBeenCalled()
})
