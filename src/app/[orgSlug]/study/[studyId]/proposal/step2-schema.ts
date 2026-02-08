import { z } from 'zod'
import { extractTextFromLexical, countWordsFromLexical } from '@/lib/word-count'

const WORD_LIMIT_ERROR = 'Word limit exceeded. Please shorten your text.'

function maxWordsRefine(maxWords: number) {
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

export const step2FormSchema = z.object({
    title: z
        .string()
        .min(1, { message: 'Study title is required' })
        .refine(maxWordsRefine(20).check, { message: maxWordsRefine(20).message }),
    datasets: z.array(z.string()).min(1, { message: 'At least one dataset is required' }),
    researchQuestions: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: 'This field is required',
        })
        .refine(maxWordsLexicalRefine(500).check, { message: maxWordsLexicalRefine(500).message }),
    projectSummary: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: 'This field is required',
        })
        .refine(maxWordsLexicalRefine(1000).check, { message: maxWordsLexicalRefine(1000).message }),
    impact: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: 'This field is required',
        })
        .refine(maxWordsLexicalRefine(500).check, { message: maxWordsLexicalRefine(500).message }),
    additionalNotes: z
        .string()
        .refine((val) => !val || countWordsFromLexical(val) <= 300, { message: WORD_LIMIT_ERROR })
        .optional()
        .default(''),
})

export type Step2FormValues = z.infer<typeof step2FormSchema>

export const initialStep2Values: Step2FormValues = {
    title: '',
    datasets: [],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
}
