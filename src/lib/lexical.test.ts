import { describe, it, expect } from 'vitest'
import {
    extractTextFromLexical,
    hasLexicalContent,
    isValidLexicalState,
    lexicalJson,
    countCharactersFromLexical,
    normalizeFeedbackToLexical,
} from './lexical'

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

describe('isValidLexicalState', () => {
    it('returns false for undefined', () => {
        expect(isValidLexicalState(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
        expect(isValidLexicalState('')).toBe(false)
    })

    it('returns false for invalid JSON', () => {
        expect(isValidLexicalState('not json')).toBe(false)
    })

    it('returns false for root with empty children array (pre-sync state)', () => {
        expect(isValidLexicalState(JSON.stringify({ root: { type: 'root', children: [] } }))).toBe(false)
    })

    it('returns false for missing root', () => {
        expect(isValidLexicalState('{}')).toBe(false)
    })

    it('returns true for root with at least one child', () => {
        expect(isValidLexicalState(lexicalJson('hello'))).toBe(true)
    })

    it('returns true for user-cleared input (empty paragraph still in children)', () => {
        expect(isValidLexicalState(lexicalJson(''))).toBe(true)
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

describe('countCharactersFromLexical', () => {
    it('counts characters, not words', () => {
        expect(countCharactersFromLexical(lexicalJson('hello world'))).toBe(11)
    })

    // Raw, not trimmed: the counter beside the field shows what the user typed, and the validator
    // has to agree with it or a field can read 10/10 while validating as 11.
    it('counts surrounding whitespace', () => {
        expect(countCharactersFromLexical(lexicalJson('  hi  '))).toBe(6)
    })

    it('returns 0 for undefined or unparseable input', () => {
        expect(countCharactersFromLexical(undefined)).toBe(0)
        expect(countCharactersFromLexical('not json')).toBe(0)
    })
})

describe('normalizeFeedbackToLexical', () => {
    it('passes a serialized Lexical state through untouched', () => {
        const json = lexicalJson('already lexical')
        expect(normalizeFeedbackToLexical(json)).toBe(json)
    })

    it('wraps plain text so callers always measure the same shape', () => {
        expect(normalizeFeedbackToLexical('plain text')).toBe(lexicalJson('plain text'))
    })

    // Non-Lexical JSON parses but carries no text, so the caller's required rule rejects it.
    it('wraps JSON that is not a Lexical root', () => {
        expect(extractTextFromLexical(normalizeFeedbackToLexical('{"a":1}'))).toBe('{"a":1}')
    })
})
