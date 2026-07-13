import { describe, it, expect } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import {
    RESUBMIT_NOTE_MAX_WORDS,
    RESUBMIT_NOTE_MIN_WORDS,
    resubmissionNoteToLexicalJson,
    resubmitNoteSchema,
} from './schema'

const buildNote = (wordCount: number) => Array.from({ length: wordCount }, (_, i) => `word${i}`).join(' ')

describe('resubmitNoteSchema', () => {
    // The MIN-1 boundary case (one word below the minimum) collapses to the
    // empty-note case while RESUBMIT_NOTE_MIN_WORDS is 1; if MIN ever rises
    // above 1, restore an explicit `buildNote(RESUBMIT_NOTE_MIN_WORDS - 1)`
    // assertion here so the lower bound stays covered.
    it('rejects an empty note', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: '' })
        expect(result.success).toBe(false)
    })

    it('accepts a note at the minimum word count', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: buildNote(RESUBMIT_NOTE_MIN_WORDS) })
        expect(result.success).toBe(true)
    })

    it('accepts a note at the maximum word count', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: buildNote(RESUBMIT_NOTE_MAX_WORDS) })
        expect(result.success).toBe(true)
    })

    it('rejects a note above the maximum word count', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: buildNote(RESUBMIT_NOTE_MAX_WORDS + 1) })
        expect(result.success).toBe(false)
    })

    it('accepts a Lexical JSON note within the word bounds', () => {
        const result = resubmitNoteSchema.safeParse({
            resubmissionNote: lexicalJson(buildNote(RESUBMIT_NOTE_MAX_WORDS)),
        })
        expect(result.success).toBe(true)
    })

    it('rejects a Lexical JSON note above the maximum word count', () => {
        const result = resubmitNoteSchema.safeParse({
            resubmissionNote: lexicalJson(buildNote(RESUBMIT_NOTE_MAX_WORDS + 1)),
        })
        expect(result.success).toBe(false)
    })

    it('rejects a Lexical JSON note whose text is only whitespace', () => {
        const result = resubmitNoteSchema.safeParse({ resubmissionNote: lexicalJson('   ') })
        expect(result.success).toBe(false)
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
