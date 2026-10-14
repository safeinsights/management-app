import { describe, expect, it } from '@/tests/unit.helpers'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from './proxy'

// Kept apart from proxy.test.ts: Next's testing utilities install an AsyncLocalStorage that breaks
// the proxy handler tests sharing a module registry with them.
describe('proxy matcher', () => {
    const runsProxy = (url: string) => unstable_doesMiddlewareMatch({ config, url })

    // OTTER-739: a crawler that gets a redirect instead of robots.txt treats the site as crawlable.
    it('skips robots.txt so signed-out crawlers and non-member users can read it', () => {
        expect(runsProxy('/robots.txt')).toBe(false)
    })

    it('skips icon.png through the static extension list', () => {
        expect(runsProxy('/icon.png')).toBe(false)
    })

    it.each([
        '/dashboard',
        '/account/signin',
        '/openstax/dashboard',
        '/notes.txt',
        '/openstax/robots.txt',
        '/robots.txt.bak',
        '/robots.txt/',
        '/Robots.txt',
    ])('still runs for %s', (url) => {
        expect(runsProxy(url)).toBe(true)
    })
})
