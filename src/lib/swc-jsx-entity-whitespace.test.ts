import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * REGRESSION CANARY — SWC JSX whitespace bug (swc-project/swc#11392).
 *
 * THE BUG
 *   Next's SWC compiler drops the significant space between an inline element
 *   (e.g. `</b>`) and an adjacent JSX text run *when that text run contains any
 *   HTML character reference* — named (`&apos;`, `&amp;`, `&rsquo;`) or numeric
 *   (`&#39;`). Babel, tsc, and esbuild all preserve the space; only SWC drops it,
 *   so it is invisible in our unit tests (vitest compiles with Babel) and only
 *   shows up in the production build. It silently rendered, e.g.,
 *   "Note: SafeInsights ..." as "Note:SafeInsights ...".
 *
 *   Root cause (see babel#17683): SWC decodes the HTML entity *before* trimming
 *   JSX whitespace instead of after, which corrupts the adjacent-space handling.
 *
 * THE WORKAROUND (this repo)
 *   We replaced HTML entities in JSX text with literal characters (e.g.
 *   `&apos;` -> `’`). An ESLint guard (`no-restricted-syntax` on `JSXText` in
 *   eslint.config.mjs) prevents reintroducing them.
 *
 * UPSTREAM STATUS
 *   Fixed in swc-core 1.15.11 (swc PR #11474) but NOT yet in our bundled
 *   `@next/swc` (see the failing assertion below for the live check).
 *
 * >>> WHEN THE "canary" TEST BELOW FAILS <<<
 *   It asserts the *current, buggy* behavior. A failure means a newer
 *   `@next/swc` has shipped the fix. At that point you can:
 *     1. delete this test,
 *     2. remove the `no-restricted-syntax` JSX-entity guard in eslint.config.mjs,
 *     3. (optionally) use HTML entities in JSX text again.
 */

// Internal Next compiler API — no public types, but stable enough for a canary.
const require = createRequire(import.meta.url)
const swc = require('next/dist/build/swc')

// Compiles a <p> whose text run after `<b>Note:</b>` starts with " SafeInsights"
// and contains `token`. Returns the compiled JS so we can check whether the
// leading space before "SafeInsights" survived.
const compile = async (token: string): Promise<string> => {
    const source =
        `const x = (<p>\n` +
        `    <b>Note:</b> SafeInsights ${token} and the text keeps going so it\n` +
        `    wraps onto a second line here.\n` +
        `</p>)`
    const { code } = await swc.transform(source, {
        filename: 'probe.tsx',
        jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'classic', pragma: 'h' } } },
    })
    return code
}

describe('SWC JSX entity whitespace (regression canary — see file header)', () => {
    beforeAll(async () => {
        await swc.loadBindings()
    })

    it('canary: SWC still drops the space when the text run contains an HTML entity', async () => {
        const code = await compile('won&apos;t store it')
        expect(
            code.includes(' SafeInsights'),
            'SWC appears to have FIXED the JSX-entity whitespace bug (swc#11392). ' +
                'Remove this test and the no-restricted-syntax JSX-entity guard in eslint.config.mjs; ' +
                'HTML entities in JSX text are safe again.',
        ).toBe(false)
    })

    it('literal apostrophe keeps the space (this is why replacing entities fixes the render)', async () => {
        const code = await compile('won’t store it')
        expect(code.includes(' SafeInsights')).toBe(true)
    })
})
