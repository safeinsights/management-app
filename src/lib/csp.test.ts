import { describe, it, expect } from 'vitest'
import { CSP_HEADER, cspHeaderValue, cspReportUrl, generateNonce, reportingEndpointsValue } from './csp'

describe('csp', () => {
    it('generates a distinct nonce each call', () => {
        const nonces = new Set(Array.from({ length: 50 }, generateNonce))

        expect(nonces.size).toBe(50)
    })

    it('generates base64 nonces with at least 128 bits of entropy', () => {
        const nonce = generateNonce()

        expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
        expect(atob(nonce)).toHaveLength(16)
    })

    it('binds script-src to the supplied nonce', () => {
        expect(cspHeaderValue('abc123')).toContain("script-src 'nonce-abc123'")
    })

    // Sentry Session Replay compresses in a blob-URL worker, which some browsers resolve through
    // script-src; without this it would be blocked by 'strict-dynamic'.
    it('allows blob workers so Sentry session replay keeps working', () => {
        expect(cspHeaderValue('abc123')).toContain("worker-src 'self' blob:")
    })

    it('forbids plugin embeds', () => {
        expect(cspHeaderValue('abc123')).toContain("object-src 'none'")
    })

    it('derives the Sentry security endpoint from the DSN', () => {
        expect(cspReportUrl('https://key123@o484030.ingest.us.sentry.io/450700')).toBe(
            'https://o484030.ingest.us.sentry.io/api/450700/security/?sentry_key=key123',
        )
    })

    it('yields no report url for a missing or malformed DSN', () => {
        expect(cspReportUrl('')).toBeUndefined()
        expect(cspReportUrl('not-a-dsn')).toBeUndefined()
        expect(cspReportUrl('https://o484030.ingest.us.sentry.io/450700')).toBeUndefined()
    })

    it('appends report directives only when given a destination', () => {
        expect(cspHeaderValue('abc123', 'https://r.example/csp')).toContain(
            'report-uri https://r.example/csp; report-to csp-report',
        )
        expect(cspHeaderValue('abc123')).not.toContain('report')
    })

    it('names the report endpoint the policy refers to', () => {
        expect(reportingEndpointsValue('https://r.example/csp')).toBe('csp-report="https://r.example/csp"')
    })

    // The rollout ships report-only so a policy that is wrong about real Clerk cannot break signin.
    // e2e runs under this policy but with Clerk faked, so real Clerk remains unverified until a
    // deployed environment reports clean. This guards the flip to enforcing being deliberate.
    it('is report-only until the policy is verified against real Clerk', () => {
        expect(CSP_HEADER).toBe('Content-Security-Policy-Report-Only')
    })
})
