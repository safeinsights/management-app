import { beforeEach, describe, expect, it, type Mock, vi } from '@/tests/unit.helpers'
import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { updateClerkUserMetadata } from '@/server/clerk'
import { NextRequest } from 'next/server'
import { CSP_HEADER, CSP_NONCE_HEADER, REPORTING_ENDPOINTS_HEADER } from '@/lib/csp'
import { continueWithNonce } from './proxy'
import { BOUNCE_PARAM, BOUNCE_VALUE } from '@/lib/signin-bounce'

type ProxyHandler = (auth: Mock, req: NextRequest) => Promise<Response>

const nonceFrom = (policy: string) => policy.match(/'nonce-([^']+)'/)?.[1]

// NextResponse.next({ request: { headers } }) exposes forwarded request headers as
// x-middleware-request-*, which is what Next's server consumes.
const forwardedHeader = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`)

describe('continueWithNonce', () => {
    // Next stamps inline scripts only with a nonce it can parse back out of the request header, so
    // a test over the policy string alone could not catch that wiring breaking.
    it('forwards a CSP request header whose script-src nonce matches the response header', () => {
        vi.stubEnv('NODE_ENV', 'production')

        const res = continueWithNonce(new NextRequest('https://example.test/dashboard'))

        const responsePolicy = res.headers.get(CSP_HEADER) ?? ''
        const forwardedPolicy = forwardedHeader(res, 'content-security-policy') ?? ''
        const nonce = nonceFrom(responsePolicy)

        expect(nonce).toBeTruthy()
        expect(forwardedPolicy).toContain(`script-src 'nonce-${nonce}'`)
        expect(forwardedHeader(res, CSP_NONCE_HEADER)).toBe(nonce)
    })

    it('points violation reports at Sentry when a DSN is configured', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://abc123@o11.ingest.us.sentry.io/22')

        const res = continueWithNonce(new NextRequest('https://example.test/dashboard'))

        expect(res.headers.get(REPORTING_ENDPOINTS_HEADER)).toBe(
            'csp-report="https://o11.ingest.us.sentry.io/api/22/security/?sentry_key=abc123"',
        )
        expect(res.headers.get(CSP_HEADER)).toContain('report-to csp-report')
    })
})

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

describe('proxy signin param sanitization', () => {
    beforeEach(() => {
        vi.resetModules()
        ;(clerkMiddleware as unknown as Mock).mockImplementation((handler) => handler)
        ;(createRouteMatcher as unknown as Mock).mockReturnValue(() => false)
    })

    const runProxy = async (url: string) => {
        const { proxy } = await import('./proxy')
        const auth = vi.fn().mockResolvedValue({ userId: null, sessionClaims: null })
        const res = await (proxy as unknown as ProxyHandler)(auth as Mock, new NextRequest(url))
        return { res, auth }
    }

    it('drops the ZAP fullwidth payload from bounce and keeps redirect_url', async () => {
        const { res, auth } = await runProxy(
            'https://app.staging.safeinsights.org/account/signin?redirect_url=%2F&bounce=%EF%BC%9Cimgsrc%3Dxonerror%3Dprompt%28%29%EF%BC%9E',
        )

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://app.staging.safeinsights.org/account/signin?redirect_url=%2F')
        expect(auth).not.toHaveBeenCalled()
    })

    it.each([
        ['bounce', '<script>alert(1)</script>'],
        ['restart', '"><img src=x>'],
        ['invite_not_found', '<svg onload=alert(1)>'],
        ['error', 'session<script>'],
        ['invite_id', 'not-a-uuid<b>'],
    ])('drops an invalid %s value', async (param, value) => {
        const { res } = await runProxy(`https://app.test/account/signin?${param}=${encodeURIComponent(value)}&keep=1`)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://app.test/account/signin?keep=1')
    })

    it('drops a param repeated with one bad value', async () => {
        const { res } = await runProxy(`https://app.test/account/signin?bounce=${BOUNCE_VALUE}&bounce=%3Cx%3E`)

        expect(res.headers.get('location')).toBe('https://app.test/account/signin')
    })

    it('lets the values the app itself writes through', async () => {
        const { res, auth } = await runProxy(
            `https://app.test/account/signin?${BOUNCE_PARAM}=${BOUNCE_VALUE}&restart=true&invite_not_found=1&error=session&invite_id=0192f3a0-1c2d-7e4f-8a9b-0c1d2e3f4a5b`,
        )

        expect(res.headers.get('location')).toBeNull()
        expect(auth).toHaveBeenCalled()
    })

    it('leaves the same params alone on other routes', async () => {
        const { auth } = await runProxy('https://app.test/account/reset-password?bounce=%3Cx%3E')

        expect(auth).toHaveBeenCalled()
    })
})

describe('proxy session marshaling failures', () => {
    beforeEach(() => {
        vi.resetModules()
        ;(clerkMiddleware as unknown as Mock).mockImplementation((handler) => handler)
        ;(createRouteMatcher as unknown as Mock).mockReturnValue(() => false)
    })

    // sessionClaims without v3 metadata force a metadata sync, which hits clerk's getUser.
    const authenticatedAuth = () =>
        vi.fn().mockResolvedValue({
            userId: 'clerk_proxy_test_user',
            sessionClaims: { userMetadata: null, unsafeMetadata: {} },
        })

    const mockClerkGetUser = (getUser: Mock) =>
        (clerkClient as unknown as Mock).mockResolvedValue({
            users: { getUser },
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
        mockClerkGetUser(getUser)

        const { proxy } = await import('./proxy')
        const req = new NextRequest('https://app.staging.safeinsights.org/dashboard')

        const res = await (proxy as unknown as ProxyHandler)(authenticatedAuth(), req)

        expect(getUser).toHaveBeenCalledTimes(2)
        // The metadata rewrite is the last step of the re-sync, so reaching it proves the retry ran
        // to completion.
        expect(updateClerkUserMetadata).toHaveBeenCalledTimes(1)
        expect(res.headers.get('location')).toBeNull()
    })

    it('keeps an authenticated user signed in when metadata regeneration also fails', async () => {
        const getUser = vi.fn().mockRejectedValue(new Error('persistent clerk api failure'))
        mockClerkGetUser(getUser)

        const { proxy } = await import('./proxy')
        const req = new NextRequest('https://app.staging.safeinsights.org/dashboard')

        const res = await (proxy as unknown as ProxyHandler)(authenticatedAuth(), req)

        expect(getUser).toHaveBeenCalledTimes(2)
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
        // OTTER-745: this branch is the only one that refuses a session, and the signin page reads the
        // mark rather than inferring the refusal from its own (stale) client state.
        expect(location).toContain(`${BOUNCE_PARAM}=${BOUNCE_VALUE}`)
    })
})
