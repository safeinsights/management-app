import { describe, it, expect } from 'vitest'
import { countWords, countWordsFromLexical, extractTextFromLexical, hasLexicalContent, lexicalJson } from './word-count'

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
        expect(extractTextFromLexical(json)).toBe('First\n\nsecond')
    })

    it('extracts text from deeply nested structure', () => {
        const json = JSON.stringify({
            root: {
                type: 'paragraph',
                children: [
                    {
                        type: 'text',
                        text: 'Nested ',
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

    it('concatenates sibling text nodes in a paragraph without spaces (formatted text)', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', text: 'un' },
                            { type: 'text', text: 'bold', format: 1 },
                            { type: 'text', text: 'ed' },
                        ],
                    },
                ],
            },
        })
        expect(extractTextFromLexical(json)).toBe('unbolded')
    })

    it('handles linebreak nodes', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', text: 'first line' },
                            { type: 'linebreak' },
                            { type: 'text', text: 'second line' },
                        ],
                    },
                ],
            },
        })
        expect(extractTextFromLexical(json)).toBe('first line\nsecond line')
    })

    it('separates paragraphs with newlines', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    { type: 'paragraph', children: [{ type: 'text', text: 'Paragraph one' }] },
                    { type: 'paragraph', children: [{ type: 'text', text: 'Paragraph two' }] },
                ],
            },
        })
        expect(extractTextFromLexical(json)).toBe('Paragraph one\n\nParagraph two')
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

    it('counts formatted text within a word as one word', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', text: 'un' },
                            { type: 'text', text: 'bold', format: 1 },
                            { type: 'text', text: 'ed word' },
                        ],
                    },
                ],
            },
        })
        expect(countWordsFromLexical(json)).toBe(2)
    })

    it('counts words across multiple paragraphs', () => {
        const json = JSON.stringify({
            root: {
                type: 'root',
                children: [
                    { type: 'paragraph', children: [{ type: 'text', text: 'Hello world' }] },
                    { type: 'paragraph', children: [{ type: 'text', text: 'foo bar baz' }] },
                ],
            },
        })
        expect(countWordsFromLexical(json)).toBe(5)
    })
})

describe('hasLexicalContent', () => {
    it('returns false when all fields are undefined', () => {
        expect(hasLexicalContent(undefined, undefined)).toBe(false)
    })

    it('returns false when all fields are empty strings', () => {
        expect(hasLexicalContent('', '')).toBe(false)
    })

    it('returns false for lexical JSON with whitespace-only content', () => {
        expect(hasLexicalContent(lexicalJson('   '), lexicalJson('\n\t'))).toBe(false)
    })

    it('returns false for lexical JSON with empty text', () => {
        expect(hasLexicalContent(lexicalJson(''))).toBe(false)
    })

    it('returns true for non-empty fields', () => {
        expect(hasLexicalContent(lexicalJson('Hello'), lexicalJson('Actual content'))).toBe(true)
    })

    it('returns true with a mix of empty and non-empty fields', () => {
        expect(hasLexicalContent(undefined, '', lexicalJson('   '), lexicalJson('Actual content'))).toBe(true)
    })

    it('returns false with no arguments', () => {
        expect(hasLexicalContent()).toBe(false)
    })
})
