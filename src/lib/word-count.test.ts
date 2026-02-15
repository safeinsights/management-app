import { describe, it, expect } from 'vitest'
import { countWords, countWordsFromLexical, extractTextFromLexical } from './word-count'

describe('countWords', () => {
    it('returns 0 for empty string', () => {
        expect(countWords('')).toBe(0)
    })

    it('returns 0 for whitespace-only string', () => {
        expect(countWords('   ')).toBe(0)
        expect(countWords('\n\t')).toBe(0)
    })

    it('counts single word', () => {
        expect(countWords('hello')).toBe(1)
    })

    it('counts multiple words separated by spaces', () => {
        expect(countWords('hello world')).toBe(2)
        expect(countWords('one two three four')).toBe(4)
    })

    it('trims leading and trailing whitespace', () => {
        expect(countWords('  hello world  ')).toBe(2)
    })

    it('collapses multiple spaces between words', () => {
        expect(countWords('hello    world')).toBe(2)
    })

    it('handles newlines as word separators', () => {
        expect(countWords('hello\nworld')).toBe(2)
    })
})

describe('extractTextFromLexical', () => {
    it('returns empty string for undefined', () => {
        expect(extractTextFromLexical(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
        expect(extractTextFromLexical('')).toBe('')
    })

    it('returns empty string for invalid JSON', () => {
        expect(extractTextFromLexical('not json')).toBe('')
        expect(extractTextFromLexical('{')).toBe('')
    })

    it('extracts text from root text node', () => {
        const json = JSON.stringify({ root: { type: 'text', text: 'Hello world' } })
        expect(extractTextFromLexical(json)).toBe('Hello world')
    })

    it('extracts text from nested children', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    { type: 'text', text: 'First' },
                    { type: 'text', text: 'second' },
                ],
            },
        })
        expect(extractTextFromLexical(json)).toBe('First second')
    })

    it('extracts text from deeply nested structure', () => {
        const json = JSON.stringify({
            root: {
                type: 'paragraph',
                children: [
                    {
                        type: 'text',
                        text: 'Nested',
                    },
                    {
                        type: 'element',
                        children: [{ type: 'text', text: 'content' }],
                    },
                ],
            },
        })
        expect(extractTextFromLexical(json)).toBe('Nested content')
    })

    it('returns empty string for root without text or children', () => {
        const json = JSON.stringify({ root: { type: 'root' } })
        expect(extractTextFromLexical(json)).toBe('')
    })

    it('handles empty children array', () => {
        const json = JSON.stringify({ root: { type: 'root', children: [] } })
        expect(extractTextFromLexical(json)).toBe('')
    })
})

describe('countWordsFromLexical', () => {
    it('returns 0 for undefined', () => {
        expect(countWordsFromLexical(undefined)).toBe(0)
    })

    it('returns 0 for empty string', () => {
        expect(countWordsFromLexical('')).toBe(0)
    })

    it('returns 0 for invalid JSON', () => {
        expect(countWordsFromLexical('invalid')).toBe(0)
    })

    it('counts words from root text node', () => {
        const json = JSON.stringify({ root: { type: 'text', text: 'Hello world' } })
        expect(countWordsFromLexical(json)).toBe(2)
    })

    it('counts words from nested children', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    { type: 'text', text: 'One two' },
                    { type: 'text', text: 'three four five' },
                ],
            },
        })
        expect(countWordsFromLexical(json)).toBe(5)
    })

    it('trims and collapses whitespace when counting', () => {
        const json = JSON.stringify({
            root: { type: 'text', text: '  extra   spaces   between   words  ' },
        })
        expect(countWordsFromLexical(json)).toBe(4)
    })
})
