import { it, vi, expect, beforeEach, type Mock } from 'vitest'
import { useUser as origUseUser } from '@clerk/nextjs'
import RootLayout from './layout'
import { render } from '@testing-library/react'
import router from 'next-router-mock'

vi.mock('./providers', () => ({
    Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/layout/app-layout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const useUser = origUseUser as unknown as Mock

beforeEach(() => {
    router.setCurrentUrl('/')
})

it('redirects to MFA setup if twoFactorEnabled is false', async () => {
    useUser.mockReturnValue({ user: { twoFactorEnabled: false } })
    render(
        <RootLayout>
            <div>Test</div>
        </RootLayout>,
        { container: document },
    )
    expect(router.asPath).toEqual('/account/mfa')
})

it('does not redirect if twoFactorEnabled is true', async () => {
    useUser.mockReturnValue({ user: { twoFactorEnabled: true } })
    render(
        <RootLayout>
            <div>Test</div>
        </RootLayout>,
        { container: document },
    )
    expect(router.asPath).toEqual('/')
})

it('does not redirect if user is null', async () => {
    useUser.mockResolvedValue({ user: null })
    render(
        <RootLayout>
            <div>Test</div>
        </RootLayout>,
        { container: document },
    )
    expect(router.asPath).toEqual('/')
})
