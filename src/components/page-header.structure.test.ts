import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// A Mantine Title with no `order` renders an h1, so both spellings have to be caught.
const H1_PATTERN = /<Title(?![^>]*\border=)[^>]*>|<Title[^>]*\border=\{1\}/

// Outside the header refactor: error and not-found screens own their own layout, and the
// SafeInsights admin area is not part of the redesign.
const EXEMPT = new Set([
    join('src', 'components', 'page-header.tsx'),
    join('src', 'app', 'not-found.tsx'),
    join('src', 'components', 'error-boundary.tsx'),
])
const EXEMPT_DIR = join('src', 'app', 'admin', 'safeinsights')

const isCandidate = (path: string) =>
    path.endsWith('.tsx') &&
    !path.endsWith('.test.tsx') &&
    !path.endsWith('.stories.tsx') &&
    !path.startsWith(EXEMPT_DIR + sep) &&
    !EXEMPT.has(path)

describe('page header is the single h1 implementation', () => {
    it('no page renders its own level-1 title', () => {
        const root = join(process.cwd(), 'src')
        const files = readdirSync(root, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => relative(process.cwd(), join(entry.parentPath, entry.name)))
            .filter(isCandidate)

        // Guards the guard: a glob that silently matches nothing would pass for the wrong reason.
        expect(files.length).toBeGreaterThan(100)

        const offenders = files.filter((file) => H1_PATTERN.test(readFileSync(join(process.cwd(), file), 'utf8')))

        expect(offenders).toEqual([])
    })
})
