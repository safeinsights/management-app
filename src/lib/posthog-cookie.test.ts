import { describe, expect, it } from '@/tests/unit.helpers'
import { parentCookieDomain, parentDomainPostHogExpiries, postHogCookieName } from './posthog-cookie'

describe('postHogCookieName', () => {
    it('names the cookie the way posthog-js does', () => {
        expect(postHogCookieName('phc_abc')).toBe('ph_phc_abc_posthog')
        expect(postHogCookieName('a+b/c=')).toBe('ph_aPLbSLcEQ_posthog')
    })
})

describe('parentCookieDomain', () => {
    it.each([
        'app.staging.safeinsights.org',
        'app.qa.safeinsights.org',
        'pr12.qa.safeinsights.org',
        'app.safeinsights.org',
    ])('resolves %s to the shared parent domain', (hostname) => {
        expect(parentCookieDomain(hostname)).toBe('safeinsights.org')
    })

    it.each(['localhost', '127.0.0.1', '::1'])('has no parent domain for %s', (hostname) => {
        expect(parentCookieDomain(hostname)).toBeNull()
    })
})

describe('parentDomainPostHogExpiries', () => {
    it('expires the main cookie and its metadata sidecar on the parent domain', () => {
        expect(parentDomainPostHogExpiries('phc_abc', 'app.qa.safeinsights.org', true)).toEqual([
            'ph_phc_abc_posthog=; Max-Age=0; Path=/; Domain=.safeinsights.org; SameSite=Lax; Secure',
            'ph_phc_abc_posthog_cpm=; Max-Age=0; Path=/; Domain=.safeinsights.org; SameSite=Lax; Secure',
        ])
    })

    it('omits Secure on plain http', () => {
        expect(parentDomainPostHogExpiries('phc_abc', 'app.qa.safeinsights.org', false)[0]).toBe(
            'ph_phc_abc_posthog=; Max-Age=0; Path=/; Domain=.safeinsights.org; SameSite=Lax',
        )
    })

    it('writes nothing where there is no parent domain or no token', () => {
        expect(parentDomainPostHogExpiries('phc_abc', 'localhost', false)).toEqual([])
        expect(parentDomainPostHogExpiries('', 'app.qa.safeinsights.org', true)).toEqual([])
    })
})
