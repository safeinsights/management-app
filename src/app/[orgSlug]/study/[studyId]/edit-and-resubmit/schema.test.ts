import { describe, it, expect } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import {
    RESUBMIT_NOTE_FIELD_TITLE,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    resubmissionNoteCharacterCount,
    resubmissionNoteToLexicalJson,
    resubmitNoteSchema,
} from './schema'
import { overCharacterLimitError } from '@/lib/field-limits'

const buildNote = (characterCount: number) => 'x'.repeat(characterCount)

const messagesFor = (value: string) => {
    const result = resubmitNoteSchema.safeParse({ resubmissionNote: value })
    return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('resubmitNoteSchema', () => {
    it('rejects an empty note', () => {
        expect(messagesFor('')).toEqual(['A resubmission note is required.'])
    })

    it('rejects a whitespace-only note', () => {
        expect(messagesFor('   ')).toEqual(['A resubmission note is required.'])
    })

    it('accepts a single character', () => {
        expect(resubmitNoteSchema.safeParse({ resubmissionNote: 'x' }).success).toBe(true)
    })

    it('accepts a note at exactly the character limit', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: buildNote(RESUBMIT_NOTE_MAX_CHARACTERS) })
        expect(result.success).toBe(true)
    })

    it('rejects one character past the limit, naming the field and the cap', () => {
        expect(messagesFor(buildNote(RESUBMIT_NOTE_MAX_CHARACTERS + 1))).toEqual([
            overCharacterLimitError(RESUBMIT_NOTE_FIELD_TITLE, RESUBMIT_NOTE_MAX_CHARACTERS),
        ])
    })

    // Characters, not words: 400 short words is past the old 300-word cap and well inside 1800
    // characters, so this fails if word counting survived.
    it('measures characters rather than words', () => {
        const manyShortWords = Array.from({ length: 400 }, () => 'ab').join(' ')
        expect(resubmitNoteSchema.safeParse({ resubmissionNote: manyShortWords }).success).toBe(true)
    })

    it('reports only the blank message for an empty note, never both rules at once', () => {
        expect(messagesFor('')).toHaveLength(1)
    })

    it('accepts a Lexical JSON note at the character limit', () => {
        const result = resubmitNoteSchema.safeParse({
            resubmissionNote: lexicalJson(buildNote(RESUBMIT_NOTE_MAX_CHARACTERS)),
        })
        expect(result.success).toBe(true)
    })

    it('rejects a Lexical JSON note above the character limit', () => {
        const result = resubmitNoteSchema.safeParse({
            resubmissionNote: lexicalJson(buildNote(RESUBMIT_NOTE_MAX_CHARACTERS + 1)),
        })
        expect(result.success).toBe(false)
    })

    it('rejects a Lexical JSON note whose text is only whitespace', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: lexicalJson('   ') })
        expect(result.success).toBe(false)
    })
})

describe('resubmissionNoteCharacterCount', () => {
    it('counts a plain-text note and the same text as Lexical JSON identically', () => {
        expect(resubmissionNoteCharacterCount('hello there')).toBe(11)
        expect(resubmissionNoteCharacterCount(lexicalJson('hello there'))).toBe(11)
    })

    // Raw, so the counter beside the field and the rule that gates it agree.
    it('counts trailing whitespace toward the total', () => {
        expect(resubmissionNoteCharacterCount('hi   ')).toBe(5)
    })
})

describe('resubmissionNoteToLexicalJson', () => {
    it('returns "" for empty and whitespace-only drafts (Lexical rejects an empty root)', () => {
        expect(resubmissionNoteToLexicalJson('')).toBe('')
        expect(resubmissionNoteToLexicalJson('   ')).toBe('')
    })

    it('passes Lexical JSON through untouched', () => {
        const json = lexicalJson('already lexical')
        expect(resubmissionNoteToLexicalJson(json)).toBe(json)
    })

    it('wraps legacy plain-text drafts', () => {
        expect(resubmissionNoteToLexicalJson('legacy plain draft')).toBe(lexicalJson('legacy plain draft'))
    })
})
