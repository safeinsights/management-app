import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ladle renders stories through .ladle/components.tsx, which must import the SAME global
// stylesheets as the app's real entrypoint (src/app/layout.tsx) — otherwise stories render with
// different (or missing) global CSS than production. The two files can't share an import statement
// (layout.tsx is bundled by Next, components.tsx by Vite), so this canary fails the moment a
// stylesheet is added to layout.tsx without being mirrored into Ladle.
const ROOT = process.cwd()

// Bare specifiers (e.g. '@mantine/core/styles.layer.css') must match exactly — basename alone would
// collide three different '*.layer.css' files. Relative specifiers point at the same file from
// different depths ('./globals.css' in layout vs '../src/app/globals.css' in Ladle), so for those
// compare by basename.
const stylesheetImports = (file: string): string[] => {
    const src = readFileSync(resolve(ROOT, file), 'utf8')
    return [...src.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map((m) =>
        m[1].startsWith('.') ? basename(m[1]) : m[1],
    )
}

describe('Ladle stylesheet parity', () => {
    it('.ladle/components.tsx imports every global stylesheet that src/app/layout.tsx does', () => {
        const appSheets = stylesheetImports('src/app/layout.tsx')
        const ladleSheets = new Set(stylesheetImports('.ladle/components.tsx'))

        expect(appSheets.length).toBeGreaterThan(0)
        const missing = appSheets.filter((sheet) => !ladleSheets.has(sheet))
        expect(
            missing,
            `stylesheets imported by layout.tsx but missing from .ladle/components.tsx: ${missing.join(', ')}`,
        ).toEqual([])
    })
})
