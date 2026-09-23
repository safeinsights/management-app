import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PENDING_RAW_STYLE_FILES, toLiteralGlob } from './no-raw-style-values-pending.mjs'

// A deleted file has to leave the list, or its per-file `warn` outlives the code it covered.
describe('pending raw-style files', () => {
    it('lists at least one file while the migration is open', () => {
        expect(PENDING_RAW_STYLE_FILES.length).toBeGreaterThan(0)
    })

    it.each(PENDING_RAW_STYLE_FILES)('%s still exists', (path) => {
        expect(existsSync(path)).toBe(true)
    })
})

// ESLint matches `files` as minimatch globs, so a route segment like `[orgSlug]` has to reach it
// as literal text, and a backslash already in the path must not turn the next character into an
// escape.
describe('toLiteralGlob', () => {
    it('escapes route-segment brackets', () => {
        expect(toLiteralGlob('src/app/[orgSlug]/page.tsx')).toBe('src/app/\\[orgSlug\\]/page.tsx')
    })

    it('escapes backslashes before they can escape anything else', () => {
        expect(toLiteralGlob('a\\[b].ts')).toBe('a\\\\\\[b\\].ts')
    })

    it('escapes the remaining glob metacharacters', () => {
        expect(toLiteralGlob('a*b?c{d}e(f)g!h+i@j.ts')).toBe('a\\*b\\?c\\{d\\}e\\(f\\)g\\!h\\+i\\@j.ts')
    })

    it('leaves plain paths untouched', () => {
        expect(toLiteralGlob('src/lib/status-labels.ts')).toBe('src/lib/status-labels.ts')
    })
})
