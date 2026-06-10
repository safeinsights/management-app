import { z } from 'zod'
import { type UseFormReturnType } from '@mantine/form'
import { extractTextFromLexical, countWordsFromLexical } from '@/lib/lexical'

const WORD_LIMIT_ERROR = 'Word limit exceeded. Please shorten your text.'
const REQUIRED_FIELD_ERROR = 'This field is required.'

export function hasUserProvidedTitle(title: string | undefined | null): boolean {
    return !!title?.trim()
}

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
    title: z
        .string()
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
    piUserId: z.string().uuid({ message: REQUIRED_FIELD_ERROR }),
})

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

// The lexical editor fields auto-save to Yjs continuously and rehydrate from it on reload,
// so they don't trigger the "Save as draft" button or the unsaved-changes prompt.
// These fields reach the `study` row exclusively via Save as draft / Submit
export const DRAFT_TRACKED_FIELDS = ['title', 'datasets', 'piName', 'piUserId'] as const

export function isProposalDraftDirty(form: UseFormReturnType<ProposalFormValues>): boolean {
    return DRAFT_TRACKED_FIELDS.some((field) => form.isDirty(field))
}

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
