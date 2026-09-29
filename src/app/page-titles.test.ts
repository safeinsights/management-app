import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = resolve(process.cwd(), 'src/app')

// not-found.tsx is a screen of its own, and Next reads its metadata like a page's.
const SCREEN_FILES = new Set(['page.tsx', 'not-found.tsx'])

const screenFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return screenFiles(full)
        return SCREEN_FILES.has(entry.name) ? [full] : []
    })

// `generateMetadata` covers the 'use server' pages, which may export nothing but async functions.
// Each match is bounded to its own export, so a `title:` prop elsewhere in the file cannot stand in.
const METADATA_EXPORT = /^export const metadata\b.*$|^export async function generateMetadata\b[\s\S]*?^\}/m
const TITLE = /title:\s*'([^']+)'/

const declaredTitle = (file: string): string | undefined =>
    existsSync(file) ? readFileSync(file, 'utf8').match(METADATA_EXPORT)?.[0].match(TITLE)?.[1] : undefined

// A client page cannot export metadata, so its title sits in a layout beside it.
const titleFor = (page: string) => declaredTitle(page) ?? declaredTitle(join(dirname(page), 'layout.tsx'))

// OTTER-734. Next announces a client-side navigation by reading the new document title, and says
// nothing when it has not changed, so a page left on the root default is silent to a screen reader.
describe('page titles', () => {
    it('gives every route a title of its own', () => {
        const pages = screenFiles(APP_DIR)
        expect(pages.length).toBeGreaterThan(0)

        const untitled = pages.filter((page) => !titleFor(page)).map((page) => relative(APP_DIR, page))

        expect(untitled, `pages with no metadata title: ${untitled.join(', ')}`).toEqual([])
    })
})
