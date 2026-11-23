import { describe, it, expect } from 'vitest'
import { httpUrl } from '@/schema/url'

const REQUIRED_ERROR = 'Link is a required field.'
const INVALID_ERROR = 'Please enter a valid URL (e.g., must start with http:// or https://).'

const schema = httpUrl('Link')

const messagesFor = (value: string) => {
    const result = schema.safeParse(value)
    return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('httpUrl', () => {
    it.each(['', '   '])('reports a blank value %j as required before it reports the format', (value) => {
        expect(messagesFor(value)[0]).toBe(REQUIRED_ERROR)
    })

    it.each(['not a url', 'example.com'])('rejects %j as an invalid URL', (value) => {
        expect(messagesFor(value)).toContain(INVALID_ERROR)
        expect(messagesFor(value)).not.toContain(REQUIRED_ERROR)
    })

    it.each(['javascript:alert(1)', 'ftp://example.com/file'])('rejects the parseable non-http URL %j', (value) => {
        expect(messagesFor(value)).toEqual([INVALID_ERROR])
    })

    it('trims the value before testing it', () => {
        expect(schema.parse('  https://example.com/path  ')).toBe('https://example.com/path')
    })
})
