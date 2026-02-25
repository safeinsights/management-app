import { describe, expect, it } from 'vitest'
import { decodeFileContents, parseCsv } from './file-content-helpers'

describe('file-content-helpers', () => {
    describe('decodeFileContents', () => {
        it('decodes ArrayBuffer to UTF-8 string', () => {
            const text = 'hello world'
            const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer
            expect(decodeFileContents(buffer)).toBe(text)
        })
    })

    describe('parseCsv', () => {
        it('parses headers and rows', () => {
            const result = parseCsv('name,age\nAlice,30\nBob,25')
            expect(result.headers).toEqual(['name', 'age'])
            expect(result.rows).toEqual([
                ['Alice', '30'],
                ['Bob', '25'],
            ])
        })

        it('returns empty for empty input', () => {
            const result = parseCsv('')
            expect(result.headers).toEqual([])
            expect(result.rows).toEqual([])
        })

        it('handles single header row with no data', () => {
            const result = parseCsv('name,age')
            expect(result.headers).toEqual(['name', 'age'])
            expect(result.rows).toEqual([])
        })

        it('trims whitespace from cells', () => {
            const result = parseCsv(' name , age \n Alice , 30 ')
            expect(result.headers).toEqual(['name', 'age'])
            expect(result.rows).toEqual([['Alice', '30']])
        })
    })
})
