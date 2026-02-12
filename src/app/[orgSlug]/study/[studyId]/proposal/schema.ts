import { z } from 'zod'
import { extractTextFromLexical, countWordsFromLexical } from '@/lib/word-count'

const WORD_LIMIT_ERROR = 'Word limit exceeded. Please shorten your text.'
const REQUIRED_FIELD_ERROR = 'This field is required.'

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

export const proposalFormSchema = z.object({
    title: z
        .string()
        .min(1, { message: REQUIRED_FIELD_ERROR })
        .refine(maxWordsRefine(20).check, { message: maxWordsRefine(20).message }),
    datasets: z.array(z.string()).min(1, { message: REQUIRED_FIELD_ERROR }),
    researchQuestions: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(500).check, { message: maxWordsLexicalRefine(500).message }),
    projectSummary: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(1000).check, { message: maxWordsLexicalRefine(1000).message }),
    impact: z
        .string()
        .refine((val) => extractTextFromLexical(val).trim().length > 0, {
            message: REQUIRED_FIELD_ERROR,
        })
        .refine(maxWordsLexicalRefine(500).check, { message: maxWordsLexicalRefine(500).message }),
    additionalNotes: z
        .string()
        .refine((val) => !val || countWordsFromLexical(val) <= 300, { message: WORD_LIMIT_ERROR })
        .optional()
        .default(''),
    piName: z.string().min(1, { message: REQUIRED_FIELD_ERROR }),
})

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

export const initialProposalValues: ProposalFormValues = {
    title: '',
    datasets: [],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
    piName: '',
}
