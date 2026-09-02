import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// A Mantine Title with no `order` renders an h1, and an `order` the reader cannot see could be 1,
// so both go in alongside the literal spellings of a level-1 heading.
const H1_PATTERNS = [
    /<Title(?![^>]*\border=)[^>]*>/,
    /<Title[^>]*\border=\{1\}/,
    /<Title[^>]*\border=\{(?![1-6]\})/,
    /<h1[\s/>]/,
    /component=["']h1["']/,
]

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

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('page header is the single h1 implementation', () => {
    it('no page renders its own level-1 title', () => {
        const root = join(process.cwd(), 'src')
        const files = readdirSync(root, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => relative(process.cwd(), join(entry.parentPath, entry.name)))
            .filter(isCandidate)

        // Guards the guard: a glob that silently matches nothing would pass for the wrong reason.
        expect(files.length).toBeGreaterThan(100)

        const offenders = files.filter((file) => H1_PATTERNS.some((pattern) => pattern.test(read(file))))

        expect(offenders).toEqual([])
    })
})

const SCREENS_DIR = join('src', 'app', '[orgSlug]', 'study', '[studyId]', '_screens')
// Renders the header rather than defining it, so counting it as a match would let any screen that
// merely imports it pass.
const ADAPTER = join('src', 'components', 'study', 'study-page-header.tsx')
const RENDERS_HEADER = /<(?:Study)?PageHeader\b/
const IMPORT_SPEC = /from\s+['"]([^'"]+)['"]/g
// Screens hand the header down at most two views deep; the extra hops cover a future split.
const MAX_DEPTH = 4

const resolveImport = (spec: string, fromFile: string) => {
    let base: string
    if (spec.startsWith('@/')) base = join('src', spec.slice(2))
    else if (spec.startsWith('.')) base = normalize(join(dirname(fromFile), spec))
    else return null

    const candidates = [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]
    return candidates.find((candidate) => existsSync(join(process.cwd(), candidate))) ?? null
}

// Local import closure, because a screen usually delegates its header to the view it renders.
const localImportClosure = (entry: string) => {
    const seen = new Set([entry])
    const frontier: Array<[string, number]> = [[entry, 0]]

    while (frontier.length) {
        const [file, depth] = frontier.pop()!
        if (depth >= MAX_DEPTH) continue

        for (const [, spec] of read(file).matchAll(IMPORT_SPEC)) {
            const resolved = resolveImport(spec, file)
            if (!resolved || seen.has(resolved)) continue
            seen.add(resolved)
            frontier.push([resolved, depth + 1])
        }
    }

    return [...seen]
}

// The h1 rule above is one-sided: it stops a second implementation but not a page that heads
// nothing at all, which is how study-results shipped with no header (OTTER-619).
describe('every study screen reaches a page header', () => {
    const registry = read(join(SCREENS_DIR, 'registry.ts'))
    const screens = [...new Set([...registry.matchAll(/from '\.\/([a-z-]+-screen)'/g)].map(([, name]) => name))]

    it('registers every screen file', () => {
        expect(screens.length).toBeGreaterThan(10)
    })

    it.each(screens)('%s renders a page header', (screen) => {
        const files = localImportClosure(join(SCREENS_DIR, `${screen}.tsx`))
        const renderers = files.filter((file) => file !== ADAPTER && RENDERS_HEADER.test(read(file)))

        expect(renderers).not.toEqual([])
    })
})
