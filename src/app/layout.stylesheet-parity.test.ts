import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

// Bare specifiers must match exactly — three different '*.layer.css' files would collide by
// basename. Relative ones resolve from different depths in layout vs Ladle, so compare basenames.
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
