import { z } from 'zod'
import { extractTextFromLexical, countWordsFromLexical } from '@/lib/lexical'

const WORD_LIMIT_ERROR = 'Word limit exceeded. Please shorten your text.'
const REQUIRED_FIELD_ERROR = 'This field is required.'

export const WORD_LIMITS = {
    title: 20,
    researchQuestions: 500,
    projectSummary: 1000,
    impact: 500,
    additionalNotes: 300,
} as const

export function maxWordsRefine(maxWords: number) {
    return {
        check: (val: string) => val.trim().split(/\s+/).filter(Boolean).length <= maxWords,
        message: WORD_LIMIT_ERROR,
    }
}

function maxWordsLexicalRefine(maxWords: number) {
    return {
        check: (val: string) => countWordsFromLexical(val) <= maxWords,
        message: WORD_LIMIT_ERROR,
    }
}

export const proposalFormSchema = z.object({
    // trim() before min(1) so a whitespace-only title fails here rather than passing schema
    // validation while a separate trimmed check silently disables submit (OTTER-647).
    title: z
        .string()
        .trim()
        .min(1, { message: REQUIRED_FIELD_ERROR })
        .refine(maxWordsRefine(WORD_LIMITS.title).check, { message: maxWordsRefine(WORD_LIMITS.title).message }),
    datasets: z.array(z.string()).min(1, { message: 'Select at least one dataset.' }),
    researchQuestions: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(WORD_LIMITS.researchQuestions).check, {
            message: maxWordsLexicalRefine(WORD_LIMITS.researchQuestions).message,
        }),
    projectSummary: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(WORD_LIMITS.projectSummary).check, {
            message: maxWordsLexicalRefine(WORD_LIMITS.projectSummary).message,
        }),
    impact: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(WORD_LIMITS.impact).check, {
            message: maxWordsLexicalRefine(WORD_LIMITS.impact).message,
        }),
    additionalNotes: z
        .string()
        .refine((val) => !val || countWordsFromLexical(val) <= WORD_LIMITS.additionalNotes, {
            message: WORD_LIMIT_ERROR,
        })
        .optional()
        .default(''),
    piName: z.string().min(1, { message: REQUIRED_FIELD_ERROR }),
    // Must never be able to fail: no field displays piUserId, so any rule on it produces an
    // error the user cannot see or clear while still blocking submit (OTTER-647). `default`
    // also absorbs the `undefined` that hydrating a draft with no PI yields, which a bare
    // `z.string()` would reject. Required-ness is expressed through piName above, which the
    // PI Select sets in the same handler; format is enforced server-side on submit.
    piUserId: z.string().default(''),
})

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

// The non-lexical proposal fields, synced individually through the Yjs fields map
// (see useYjsFormMap). The lexical editor fields auto-save to Yjs continuously.
export const COLLAB_FIELD_KEYS = ['title', 'datasets', 'piName', 'piUserId'] as const

export type CollabFieldKey = (typeof COLLAB_FIELD_KEYS)[number]

export const initialProposalValues: ProposalFormValues = {
    title: '',
    datasets: [],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
    piName: '',
    piUserId: '',
}
