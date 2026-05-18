import { z } from 'zod'
import { countWords } from '@/lib/lexical'

export const RESUBMIT_NOTE_MIN_WORDS = 1
export const RESUBMIT_NOTE_MAX_WORDS = 300

const REQUIRED_NOTE_ERROR = 'A resubmission note is required.'
const NOTE_MAX_ERROR = `Resubmission note must be ${RESUBMIT_NOTE_MAX_WORDS} words or fewer.`

export const resubmitNoteSchema = z.object({
    resubmissionNote: z
        .string()
        .min(1, { message: REQUIRED_NOTE_ERROR })
        .refine(
            (val) => {
                const count = countWords(val)
                return count >= RESUBMIT_NOTE_MIN_WORDS
            },
            { message: REQUIRED_NOTE_ERROR },
        )
        .refine((val) => countWords(val) <= RESUBMIT_NOTE_MAX_WORDS, { message: NOTE_MAX_ERROR }),
})

export type ResubmitNoteValue = z.infer<typeof resubmitNoteSchema>

export const initialResubmitNoteValue: ResubmitNoteValue = {
    resubmissionNote: '',
}
