import { describe, it, expect, vi } from 'vitest'

// next.config.ts throws at import time unless this is set, guarding against a production build
// silently generating a throwaway Server Actions key. Stub it before the import so the guard is
// satisfied without depending on the developer's environment.
vi.stubEnv('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY', 'test-key')

const { default: nextConfig } = await import('../../next.config')

// The static headers are the only CSP an unauthenticated response is guaranteed to carry: the
// nonce-based script-src is still report-only (see ./csp.ts), so anything asserted as enforced
// has to live in next.config.ts rather than the proxy.
const staticCsp = async () => {
    const [rule] = await nextConfig.headers!()
    return rule.headers.find((h) => h.key === 'Content-Security-Policy')!.value
}

describe('static security headers', () => {
    it('enforces the directives that have no default-src fallback', async () => {
        const policy = await staticCsp()

        expect(policy).toContain("frame-ancestors 'none'")
        expect(policy).toContain("form-action 'self'")
        expect(policy).toContain("base-uri 'self'")
    })

    it('enforces object-src rather than leaving it to the report-only policy', async () => {
        expect(await staticCsp()).toContain("object-src 'none'")
    })

    it('does not advertise the framework', () => {
        expect(nextConfig.poweredByHeader).toBe(false)
    })

    it('emits subresource integrity hashes on generated script tags', () => {
        expect(nextConfig.experimental?.sri?.algorithm).toBe('sha256')
    })
})
