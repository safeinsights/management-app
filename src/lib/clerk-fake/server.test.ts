// @vitest-environment node
// happy-dom strips the cookie header from a Request, and the fake reads the role from it.
import { describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { clerkMiddleware } from './server'

vi.mock('./resolve-clerk-id.server', () => ({ resolveClerkId: vi.fn(async () => 'database-clerk-id') }))

const request = (cookie?: string) =>
    new NextRequest('http://localhost:4100/dashboard', { headers: cookie ? { cookie, 'x-test': 'kept' } : {} })

describe('clerk-fake clerkMiddleware', () => {
    it('uses the resolved database Clerk id in proxy auth', async () => {
        const handler = vi.fn(async (auth) => {
            expect((await auth()).userId).toBe('database-clerk-id')
        })
        await clerkMiddleware(handler)(request('__e2e_role=admin'))
        expect(handler).toHaveBeenCalledOnce()
    })

    it('forwards the auth status header, as real Clerk does', async () => {
        const res = await clerkMiddleware(() => undefined)(request('__e2e_role=admin'))

        expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-in')
        expect(res.headers.get('x-middleware-override-headers')).toContain('x-clerk-auth-status')
        expect(res.headers.get('x-middleware-request-x-test')).toBe('kept')
    })

    it('reports signed-out without a role cookie', async () => {
        const res = await clerkMiddleware(() => undefined)(request())

        expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-out')
    })

    it('keeps request headers that the handler already forwards', async () => {
        const res = await clerkMiddleware((_auth, req) => {
            const headers = new Headers(req.headers)
            headers.set('x-csp-nonce', 'abc')
            return NextResponse.next({ request: { headers } })
        })(request('__e2e_role=admin'))

        expect(res.headers.get('x-middleware-request-x-csp-nonce')).toBe('abc')
        expect(res.headers.get('x-middleware-override-headers')).toMatch(/x-csp-nonce.*x-clerk-auth-status/)
    })

    it('leaves a redirect alone', async () => {
        const res = await clerkMiddleware(() => NextResponse.redirect('http://localhost:4100/account/signin'))(
            request('__e2e_role=admin'),
        )

        expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBeNull()
    })
})
