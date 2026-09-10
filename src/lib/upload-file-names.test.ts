import { describe, expect, it } from '@/tests/unit.helpers'
import { nextAvailableFileName, renameFile } from './upload-file-names'

describe('nextAvailableFileName', () => {
    it('leaves a name alone when nothing collides', () => {
        expect(nextAvailableFileName('main.R', ['helper.R'])).toBe('main.R')
    })

    it('suffixes before the extension so the file stays openable', () => {
        expect(nextAvailableFileName('main.R', ['main.R'])).toBe('main (1).R')
    })

    it('counts already-suffixed names as taken', () => {
        // The card's case: uploading main.R twice with Keep both must not land back on (1).
        expect(nextAvailableFileName('main.R', ['main.R', 'main (1).R'])).toBe('main (2).R')
    })

    it('fills the first free slot rather than always appending', () => {
        expect(nextAvailableFileName('main.R', ['main.R', 'main (2).R'])).toBe('main (1).R')
    })

    it('handles names with dots in them', () => {
        expect(nextAvailableFileName('data.catalog.2026.csv', ['data.catalog.2026.csv'])).toBe(
            'data.catalog.2026 (1).csv',
        )
    })

    it('handles a name with no extension', () => {
        expect(nextAvailableFileName('README', ['README'])).toBe('README (1)')
    })

    it('treats a leading dot as the name, not an extension', () => {
        expect(nextAvailableFileName('.env', ['.env'])).toBe('.env (1)')
    })
})

describe('renameFile', () => {
    it('keeps the bytes and type while changing the name', async () => {
        const original = new File(['print(1)'], 'main.R', { type: 'text/plain' })

        const renamed = renameFile(original, 'main (1).R')

        expect(renamed.name).toBe('main (1).R')
        expect(renamed.type).toBe('text/plain')
        expect(await renamed.text()).toBe('print(1)')
    })
})
