import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { SLUG_TO_STUDY_COLUMN, seedYDocFromLexical } from './lexical-seed'

const SAMPLE_LEXICAL_JSON = JSON.stringify({
    root: {
        children: [
            {
                children: [
                    {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'Hello, collaborator!',
                        type: 'text',
                        version: 1,
                    },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
    },
})

describe('seedYDocFromLexical', () => {
    it('returns false on null input', () => {
        const yDoc = new Y.Doc()
        expect(seedYDocFromLexical(yDoc, null)).toBe(false)
        expect(yDoc.share.size).toBe(0)
    })

    it('returns false on undefined input', () => {
        const yDoc = new Y.Doc()
        expect(seedYDocFromLexical(yDoc, undefined)).toBe(false)
        expect(yDoc.share.size).toBe(0)
    })

    it('returns false on empty/whitespace input', () => {
        const yDoc = new Y.Doc()
        expect(seedYDocFromLexical(yDoc, '')).toBe(false)
        expect(seedYDocFromLexical(yDoc, '   ')).toBe(false)
        expect(yDoc.share.size).toBe(0)
    })

    it('seeds the Y.Doc with the parsed Lexical JSON content', () => {
        const yDoc = new Y.Doc()
        expect(seedYDocFromLexical(yDoc, SAMPLE_LEXICAL_JSON)).toBe(true)
        // Lexical's CollabElementNode binds the editor root to Y.XmlText named 'root'.
        const root = yDoc.get('root', Y.XmlText)
        expect(root).toBeDefined()
        // Round-trip: the seeded text should appear somewhere in the Y.Doc state.
        const serialized = JSON.stringify(yDoc.toJSON())
        expect(serialized).toContain('Hello, collaborator!')
    })

    it('throws on malformed JSON so caller can decide how to handle corruption', () => {
        const yDoc = new Y.Doc()
        expect(() => seedYDocFromLexical(yDoc, '{ not json')).toThrow()
    })
})

describe('SLUG_TO_STUDY_COLUMN', () => {
    it('maps every proposal-text slug to a snake-cased column name', () => {
        expect(SLUG_TO_STUDY_COLUMN).toEqual({
            'research-questions': 'research_questions',
            'project-summary': 'project_summary',
            impact: 'impact',
            'additional-notes': 'additional_notes',
        })
    })
})
