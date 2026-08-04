import { describe, expect, it } from 'vitest'
import { decodeFileContents, formatJson, imageMimeType, parseCsv, parseLogMessages } from './file-content-helpers'

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

        // This viewer is selected by sniffing content, so a log-shaped result file would otherwise
        // render as a two-column table with its remaining fields silently dropped.
        it('declines log-shaped entries carrying extra fields rather than dropping them', () => {
            expect(parseLogMessages('[{"timestamp":1,"message":"ok","estimate":42}]')).toBeNull()
        })
    })

    describe('formatJson', () => {
        it('pretty-prints minified JSON', () => {
            expect(formatJson('{"a":1,"b":[2,3]}')).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
        })

        it('returns null for text that is not JSON', () => {
            expect(formatJson('not json at all')).toBeNull()
            expect(formatJson('{broken')).toBeNull()
        })

        // Reviewers judge disclosure safety off these numbers, so showing one that disagrees with
        // the file is worse than showing an unformatted line.
        it.each([
            ['integers beyond MAX_SAFE_INTEGER', '{"n":9007199254740993}'],
            ['high-precision floats', '{"m":0.1234567890123456789}'],
            ['very large integers', '{"big":12345678901234567890}'],
            ['trailing-zero decimals', '{"a":1.50}'],
            ['exponent notation', '{"b":1e5}'],
        ])('declines to reformat when %s would be altered', (_label, input) => {
            expect(formatJson(input)).toBeNull()
        })

        it('still formats when whitespace is the only difference', () => {
            expect(formatJson('{ "a" : 1 }')).toBe('{\n  "a": 1\n}')
        })

        it('does not mistake whitespace inside strings for formatting', () => {
            expect(formatJson('{"a":"two  spaces"}')).toBe('{\n  "a": "two  spaces"\n}')
            expect(formatJson('{"a":"has \\" quote"}')).toBe('{\n  "a": "has \\" quote"\n}')
        })
    })

    describe('imageMimeType', () => {
        it('returns the correct MIME type for known image extensions', () => {
            expect(imageMimeType('plot.png')).toBe('image/png')
            expect(imageMimeType('photo.jpg')).toBe('image/jpeg')
            expect(imageMimeType('photo.jpeg')).toBe('image/jpeg')
            expect(imageMimeType('anim.gif')).toBe('image/gif')
            expect(imageMimeType('icon.svg')).toBe('image/svg+xml')
            expect(imageMimeType('hero.webp')).toBe('image/webp')
            expect(imageMimeType('old.bmp')).toBe('image/bmp')
        })

        it('is case-insensitive for extensions', () => {
            expect(imageMimeType('PLOT.PNG')).toBe('image/png')
            expect(imageMimeType('Photo.JPG')).toBe('image/jpeg')
        })

        it('returns null for non-image files', () => {
            expect(imageMimeType('data.csv')).toBeNull()
            expect(imageMimeType('script.py')).toBeNull()
            expect(imageMimeType('results.txt')).toBeNull()
            expect(imageMimeType('noext')).toBeNull()
        })
    })
})
