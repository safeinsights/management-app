import { describe, it, expect } from 'vitest'
import { RESUBMIT_NOTE_MAX_WORDS, RESUBMIT_NOTE_MIN_WORDS, resubmitNoteSchema } from './schema'

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
})
