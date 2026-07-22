import { beforeEach, describe, expect, it, type Mock, vi } from '@/tests/unit.helpers'
import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

type ProxyHandler = (auth: Mock, req: NextRequest) => Promise<Response>

describe('proxy redirect_url sanitization', () => {
    beforeEach(() => {
        vi.resetModules()
        ;(clerkMiddleware as unknown as Mock).mockImplementation((handler) => handler)
        ;(createRouteMatcher as unknown as Mock).mockReturnValue(() => false)
    })

    it('removes malicious redirect_url payloads before rendering reset-password page', async () => {
        const { proxy } = await import('./proxy')
        const auth = vi.fn()
        const req = new NextRequest(
            'https://app.staging.safeinsights.org/account/reset-password?redirect_url=%0A%0D%0A%0D%3CscrIpt%3Ealert%281%29%3B%3C%2FscRipt%3E&_rsc=a4jo2',
        )

        const res = await (proxy as unknown as ProxyHandler)(auth as Mock, req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe(
            'https://app.staging.safeinsights.org/account/reset-password?_rsc=a4jo2',
        )
        expect(res.headers.get('location')).not.toContain('redirect_url')
        expect(auth).not.toHaveBeenCalled()
    })

    it('removes redirect_url when encoded control chars are present after leading slash', async () => {
        const { proxy } = await import('./proxy')
        const auth = vi.fn()
        const req = new NextRequest(
            'https://app.staging.safeinsights.org/account/reset-password?redirect_url=/%0D%0A%0D%0A%3Cscript%3Ealert(1)%3C/script%3E&_rsc=a4jo2',
        )

        const res = await (proxy as unknown as ProxyHandler)(auth as Mock, req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe(
            'https://app.staging.safeinsights.org/account/reset-password?_rsc=a4jo2',
        )
        expect(res.headers.get('location')).not.toContain('redirect_url')
        expect(auth).not.toHaveBeenCalled()
    })
})

describe('proxy session marshaling failures', () => {
    beforeEach(() => {
        vi.resetModules()
        ;(clerkMiddleware as unknown as Mock).mockImplementation((handler) => handler)
        ;(createRouteMatcher as unknown as Mock).mockReturnValue(() => false)
    })

    // sessionClaims without v3 metadata force a metadata sync, which hits clerk's getUser
    const authenticatedAuth = () =>
        vi.fn().mockResolvedValue({
            userId: 'clerk_proxy_test_user',
            sessionClaims: { userMetadata: null, unsafeMetadata: {} },
        })

    const mockClerkGetUser = (getUser: Mock, updateUserMetadata: Mock = vi.fn()) =>
        (clerkClient as unknown as Mock).mockResolvedValue({
            users: { getUser, updateUserMetadata },
        })

    it('recovers by re-syncing metadata when the first marshal attempt fails', async () => {
        const email = `proxy-recovery-${Date.now()}@test.com`
        const getUser = vi
            .fn()
            .mockRejectedValueOnce(new Error('transient clerk api failure'))
            .mockResolvedValue({
                id: 'clerk_proxy_test_user',
                firstName: 'Proxy',
                lastName: 'Test',
                primaryEmailAddress: { emailAddress: email },
                emailAddresses: [{ emailAddress: email }],
                publicMetadata: {},
            })
        const updateUserMetadata = vi.fn()
        mockClerkGetUser(getUser, updateUserMetadata)

        const { proxy } = await import('./proxy')
        const req = new NextRequest('https://app.staging.safeinsights.org/dashboard')

        const res = await (proxy as unknown as ProxyHandler)(authenticatedAuth(), req)

        expect(getUser).toHaveBeenCalledTimes(2)
        // metadata was regenerated from the live Clerk user, proving the forced re-sync ran to completion
        expect(updateUserMetadata).toHaveBeenCalledTimes(1)
        expect(res.headers.get('location')).toBeNull()
    })

    it('keeps an authenticated user signed in when metadata regeneration also fails', async () => {
        const getUser = vi.fn().mockRejectedValue(new Error('persistent clerk api failure'))
        mockClerkGetUser(getUser)

        const { proxy } = await import('./proxy')
        const req = new NextRequest('https://app.staging.safeinsights.org/dashboard')

        const res = await (proxy as unknown as ProxyHandler)(authenticatedAuth(), req)

        expect(getUser).toHaveBeenCalledTimes(2)
        // never bounce an authenticated user to signin — they proceed with a blank session
        expect(res.headers.get('location')).toBeNull()
    })

    it('still redirects unauthenticated visitors to signin with a redirect_url', async () => {
        const auth = vi.fn().mockResolvedValue({ userId: null, sessionClaims: null })

        const { proxy } = await import('./proxy')
        const req = new NextRequest('https://app.staging.safeinsights.org/dashboard')

        const res = await (proxy as unknown as ProxyHandler)(auth, req)

        const location = res.headers.get('location')
        expect(location).toContain('/account/signin')
        expect(location).toContain('redirect_url=%2Fdashboard')
        expect(location).not.toContain('error=session')
    })
})
