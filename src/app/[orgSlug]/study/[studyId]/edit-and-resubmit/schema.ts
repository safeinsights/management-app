import { z } from 'zod'
import { lexicalToText, normalizeFeedbackToLexical } from '@/lib/lexical'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

export const RESUBMIT_NOTE_FIELD_TITLE = 'Resubmission note'
export const RESUBMIT_NOTE_MAX_CHARACTERS = 1800
// DOM id of the editor surface; the page-level Resubmit click jumps to it by this id (OTTER-762).
export const RESUBMISSION_NOTE_FIELD_ID = 'resubmissionNote'

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
// Names the field because Resubmit raises it alongside the proposal fields' errors (OTTER-762).
export const PROPOSAL_REQUIRED_NOTE_ERROR = 'Enter your resubmission note before continuing.'
export const NOTE_MAX_ERROR = overCharacterLimitError(RESUBMIT_NOTE_FIELD_TITLE, RESUBMIT_NOTE_MAX_CHARACTERS)

// The proposal flow submits Lexical JSON while the code flow submits plain text, so every helper
// reads through `lexicalToText` to measure both shapes the same way.
export function resubmissionNoteCharacterCount(value: string): number {
    return countCharacters(lexicalToText(value))
}

export function resubmissionNoteIsBlank(value: string): boolean {
    return !lexicalToText(value).trim()
}

export function resubmissionNoteIsOverLimit(value: string): boolean {
    return resubmissionNoteCharacterCount(value) > RESUBMIT_NOTE_MAX_CHARACTERS
}

// Lexical rejects an empty-root state, so empty drafts stay '' and callers read that as "no
// initial value".
export function resubmissionNoteToLexicalJson(value: string): string {
    if (!lexicalToText(value).trim()) return ''
    return normalizeFeedbackToLexical(value)
}

// The required copy is the only thing the two flows disagree on: the proposal page names the field
// the way its sibling errors do (OTTER-762), the code page keeps its own until its card lands.
const buildResubmitNoteSchema = (requiredError: string) =>
    z.object({
        // superRefine rather than chained refines so a blank note reports only that it is blank.
        resubmissionNote: z.string().superRefine((val, ctx) => {
            if (resubmissionNoteIsBlank(val)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: requiredError })
                return
            }
            if (resubmissionNoteIsOverLimit(val)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: NOTE_MAX_ERROR })
            }
        }),
    })

export const resubmitNoteSchema = buildResubmitNoteSchema(REQUIRED_NOTE_ERROR)
export const proposalResubmitNoteSchema = buildResubmitNoteSchema(PROPOSAL_REQUIRED_NOTE_ERROR)

export type ResubmitNoteValue = z.infer<typeof resubmitNoteSchema>

export const initialResubmitNoteValue: ResubmitNoteValue = {
    resubmissionNote: '',
}
