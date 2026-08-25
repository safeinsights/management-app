import { z } from 'zod'
import { lexicalToText, normalizeFeedbackToLexical } from '@/lib/lexical'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

export const RESUBMIT_NOTE_FIELD_TITLE = 'Resubmission note'
export const RESUBMIT_NOTE_MAX_CHARACTERS = 1800

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
const NOTE_MAX_ERROR = overCharacterLimitError(RESUBMIT_NOTE_FIELD_TITLE, RESUBMIT_NOTE_MAX_CHARACTERS)

/**
 * The proposal flow submits Lexical JSON; the code flow still submits plain text.
 *
 * This is the one field pair in the app where both shapes really arrive, so all three helpers read
 * the value through `lexicalToText` and none of them branches on the shape itself. The two note
 * fields, their counters and the server rule then measure a note the same way whichever shape it
 * came in.
 */
export function resubmissionNoteCharacterCount(value: string): number {
    return countCharacters(lexicalToText(value))
}

/** Whether the note has any content at all, ignoring surrounding whitespace. */
export function resubmissionNoteIsBlank(value: string): boolean {
    return !lexicalToText(value).trim()
}

// Empty drafts stay '' - Lexical rejects an empty-root state, so callers treat '' as "no initial
// value". Blankness is judged on the text, not the raw string, so a Lexical document that holds
// nothing is treated the same as an empty one rather than being wrapped and shown to the user as
// its own JSON.
export function resubmissionNoteToLexicalJson(value: string): string {
    if (!lexicalToText(value).trim()) return ''
    return normalizeFeedbackToLexical(value)
}

export const resubmitNoteSchema = z.object({
    // superRefine rather than chained refines so a blank note reports only that it is blank; the
    // two rules cannot both be reported under one control without reading as a defect.
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
