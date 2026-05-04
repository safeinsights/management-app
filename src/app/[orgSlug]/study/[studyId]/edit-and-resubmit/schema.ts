import { z } from 'zod'
import { countWords } from '@/lib/word-count'

export const RESUBMIT_NOTE_MIN_WORDS = 50
export const RESUBMIT_NOTE_MAX_WORDS = 300

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
const NOTE_RANGE_ERROR = `Resubmission note must be between ${RESUBMIT_NOTE_MIN_WORDS} and ${RESUBMIT_NOTE_MAX_WORDS} words.`

export const resubmitNoteSchema = z.object({
    resubmissionNote: z
        .string()
        .min(1, { message: REQUIRED_NOTE_ERROR })
        .refine(
            (val) => {
                const count = countWords(val)
                return count >= RESUBMIT_NOTE_MIN_WORDS && count <= RESUBMIT_NOTE_MAX_WORDS
            },
            { message: NOTE_RANGE_ERROR },
        ),
})

export type ResubmitNoteValue = z.infer<typeof resubmitNoteSchema>

export const initialResubmitNoteValue: ResubmitNoteValue = {
    resubmissionNote: '',
}
