import { beforeEach, describe, expect, it, type Mock, vi } from '@/tests/unit.helpers'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
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
