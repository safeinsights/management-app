import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = resolve(process.cwd(), 'src/app')

const pageFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return pageFiles(full)
        return entry.name === 'page.tsx' ? [full] : []
    })

// `generateMetadata` covers the 'use server' pages, which may export nothing but async functions.
const TITLE = /export (?:const metadata\b|async function generateMetadata\b)[\s\S]*?title:\s*'([^']+)'/

const declaredTitle = (file: string): string | undefined =>
    existsSync(file) ? readFileSync(file, 'utf8').match(TITLE)?.[1] : undefined

// A client page cannot export metadata, so its title sits in a layout beside it.
const titleFor = (page: string) => declaredTitle(page) ?? declaredTitle(join(dirname(page), 'layout.tsx'))

// OTTER-734. Next announces a client-side navigation by reading the new document title, and says
// nothing when it has not changed, so a page left on the root default is silent to a screen reader.
describe('page titles', () => {
    it('gives every route a title of its own', () => {
        const pages = pageFiles(APP_DIR)
        expect(pages.length).toBeGreaterThan(0)

        const untitled = pages.filter((page) => !titleFor(page)).map((page) => relative(APP_DIR, page))

        expect(untitled, `pages with no metadata title: ${untitled.join(', ')}`).toEqual([])
    })
})
