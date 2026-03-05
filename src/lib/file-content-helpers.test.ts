import { describe, expect, it } from 'vitest'
import { decodeFileContents, parseCsv, parseLogMessages } from './file-content-helpers'

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

    describe('parseLogMessages', () => {
        it('parses valid log JSON', () => {
            const input = JSON.stringify([
                { timestamp: 1000, message: 'hello' },
                { timestamp: 2000, message: 'world' },
            ])
            expect(parseLogMessages(input)).toEqual([
                { timestamp: 1000, message: 'hello' },
                { timestamp: 2000, message: 'world' },
            ])
        })

        it('handles whitespace around the JSON', () => {
            const input = `  [{"timestamp":1000,"message":"trimmed"}]  `
            expect(parseLogMessages(input)).toEqual([{ timestamp: 1000, message: 'trimmed' }])
        })

        it('returns null for plain text', () => {
            expect(parseLogMessages('just a regular log line')).toBeNull()
        })

        it('returns null for invalid JSON', () => {
            expect(parseLogMessages('[{broken')).toBeNull()
        })

        it('returns null for empty array', () => {
            expect(parseLogMessages('[]')).toBeNull()
        })

        it('returns null when entries are missing required fields', () => {
            expect(parseLogMessages('[{"timestamp":1000}]')).toBeNull()
            expect(parseLogMessages('[{"message":"hello"}]')).toBeNull()
        })
    })
})
