import { z } from 'zod'
import { countWords, countWordsFromLexical, isValidLexicalState, lexicalJson } from '@/lib/lexical'

export const RESUBMIT_NOTE_MIN_WORDS = 1
export const RESUBMIT_NOTE_MAX_WORDS = 300

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
const NOTE_MAX_ERROR = `Resubmission note must be ${RESUBMIT_NOTE_MAX_WORDS} words or fewer.`

// The proposal flow submits Lexical JSON; the code flow still submits plain text.
export function resubmissionNoteWordCount(value: string): number {
    return isValidLexicalState(value) ? countWordsFromLexical(value) : countWords(value)
}

// Empty drafts stay '' — Lexical rejects an empty-root state, so callers treat
// '' as "no initial value".
export function resubmissionNoteToLexicalJson(value: string): string {
    if (!value.trim()) return ''
    return isValidLexicalState(value) ? value : lexicalJson(value)
}

export const resubmitNoteSchema = z.object({
    resubmissionNote: z
        .string()
        .min(1, { message: REQUIRED_NOTE_ERROR })
        .refine((val) => resubmissionNoteWordCount(val) >= RESUBMIT_NOTE_MIN_WORDS, { message: REQUIRED_NOTE_ERROR })
        .refine((val) => resubmissionNoteWordCount(val) <= RESUBMIT_NOTE_MAX_WORDS, { message: NOTE_MAX_ERROR }),
})

export type ResubmitNoteValue = z.infer<typeof resubmitNoteSchema>

export const initialResubmitNoteValue: ResubmitNoteValue = {
    resubmissionNote: '',
}
