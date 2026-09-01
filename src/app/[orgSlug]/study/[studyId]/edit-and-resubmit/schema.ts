import { z } from 'zod'
import { lexicalToText, normalizeFeedbackToLexical } from '@/lib/lexical'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

export const RESUBMIT_NOTE_FIELD_TITLE = 'Resubmission note'
export const RESUBMIT_NOTE_MAX_CHARACTERS = 1800

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
const NOTE_MAX_ERROR = overCharacterLimitError(RESUBMIT_NOTE_FIELD_TITLE, RESUBMIT_NOTE_MAX_CHARACTERS)

// The proposal flow submits Lexical JSON while the code flow submits plain text, so every helper
// reads through `lexicalToText` to measure both shapes the same way.
export function resubmissionNoteCharacterCount(value: string): number {
    return countCharacters(lexicalToText(value))
}

export function resubmissionNoteIsBlank(value: string): boolean {
    return !lexicalToText(value).trim()
}

// Lexical rejects an empty-root state, so empty drafts stay '' and callers read that as "no
// initial value".
export function resubmissionNoteToLexicalJson(value: string): string {
    if (!lexicalToText(value).trim()) return ''
    return normalizeFeedbackToLexical(value)
}

export const resubmitNoteSchema = z.object({
    // superRefine rather than chained refines so a blank note reports only that it is blank.
    resubmissionNote: z.string().superRefine((val, ctx) => {
        if (resubmissionNoteIsBlank(val)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: REQUIRED_NOTE_ERROR })
            return
        }
        if (resubmissionNoteCharacterCount(val) > RESUBMIT_NOTE_MAX_CHARACTERS) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: NOTE_MAX_ERROR })
        }
    }),
})

export type ResubmitNoteValue = z.infer<typeof resubmitNoteSchema>

export const initialResubmitNoteValue: ResubmitNoteValue = {
    resubmissionNote: '',
}
