import { z } from 'zod'
import { countCharactersFromLexical, hasLexicalContent } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'
import { studyTitleField } from '@/app/[orgSlug]/study/request/form-schemas'

const REQUIRED_FIELD_ERROR = 'This field is required.'

// Shared by both flows that render these fields (OTTER-691, OTTER-737). The study title has its
// own cap, STUDY_TITLE_MAX_CHARACTERS.
export const CHARACTER_LIMITS = {
    researchQuestions: 3000,
    projectSummary: 6000,
    impact: 3000,
    additionalNotes: 1800,
} as const

export const FIELD_TITLES = {
    researchQuestions: 'Research question(s)',
    projectSummary: 'Project summary',
    impact: 'Impact',
    additionalNotes: 'Additional notes or requests',
} as const

// superRefine rather than chained refines so a blank field reports only that it is empty.
const lexicalField = (fieldTitle: string, requiredError: string | null, maxCharacters: number) =>
    z.string().superRefine((val, ctx) => {
        if (requiredError && !hasLexicalContent(val)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: requiredError })
            return
        }
        if (countCharactersFromLexical(val) > maxCharacters) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: overCharacterLimitError(fieldTitle, maxCharacters),
            })
        }
    })

const PI_UNLINKED_ERROR = 'Select a Principal Investigator from the list.'

export const isLinkedPiUserId = (piUserId: string | undefined) => z.uuid().safeParse(piUserId).success

// Reviewer views key off piUserId to show the profile, so a name alone is not enough. The issue
// attaches to piName because that is the path the Select displays.
const validateLinkedPi = (data: { piName: string; piUserId: string }, ctx: z.RefinementCtx) => {
    if (data.piName && !isLinkedPiUserId(data.piUserId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PI_UNLINKED_ERROR, path: ['piName'] })
    }
}

const proposalFieldsSchema = z.object({
    title: studyTitleField(REQUIRED_FIELD_ERROR),
    datasets: z.array(z.string()).min(1, { message: 'Select at least one dataset.' }),
    researchQuestions: lexicalField(
        FIELD_TITLES.researchQuestions,
        REQUIRED_FIELD_ERROR,
        CHARACTER_LIMITS.researchQuestions,
    ),
    projectSummary: lexicalField(FIELD_TITLES.projectSummary, REQUIRED_FIELD_ERROR, CHARACTER_LIMITS.projectSummary),
    impact: lexicalField(FIELD_TITLES.impact, REQUIRED_FIELD_ERROR, CHARACTER_LIMITS.impact),
    additionalNotes: lexicalField(FIELD_TITLES.additionalNotes, null, CHARACTER_LIMITS.additionalNotes)
        .optional()
        .default(''),
    piName: z.string().min(1, { message: REQUIRED_FIELD_ERROR }),
    // No rule of its own: nothing displays piUserId, so an error here would block submit invisibly
    // (OTTER-647).
    piUserId: z.string().default(''),
})

export const proposalFormSchema = proposalFieldsSchema.superRefine(validateLinkedPi)

// Each names its field because Submit raises them all at once (OTTER-691).
export const DRAFT_REQUIRED_ERRORS = {
    datasets: 'Select a dataset of interest before continuing.',
    researchQuestions: 'Enter your research questions before continuing.',
    projectSummary: 'Enter your project summary before continuing.',
    impact: 'Enter your proposal impact before continuing.',
    piName: 'Select a Principal Investigator before continuing.',
} as const

// On a DRAFT the title lives on Step 1 (OTTER-690); requiring an unrendered field would block
// submit with nothing to clear (OTTER-647).
export const draftProposalFormSchema = proposalFieldsSchema
    .omit({ title: true })
    .extend({
        datasets: z.array(z.string()).min(1, { message: DRAFT_REQUIRED_ERRORS.datasets }),
        researchQuestions: lexicalField(
            FIELD_TITLES.researchQuestions,
            DRAFT_REQUIRED_ERRORS.researchQuestions,
            CHARACTER_LIMITS.researchQuestions,
        ),
        projectSummary: lexicalField(
            FIELD_TITLES.projectSummary,
            DRAFT_REQUIRED_ERRORS.projectSummary,
            CHARACTER_LIMITS.projectSummary,
        ),
        impact: lexicalField(FIELD_TITLES.impact, DRAFT_REQUIRED_ERRORS.impact, CHARACTER_LIMITS.impact),
        additionalNotes: lexicalField(FIELD_TITLES.additionalNotes, null, CHARACTER_LIMITS.additionalNotes)
            .optional()
            .default(''),
        piName: z.string().min(1, { message: DRAFT_REQUIRED_ERRORS.piName }),
    })
    .superRefine(validateLinkedPi)

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

// Order matters: piUserId must apply before piName, or the cross-field rule strands a
// "Select a Principal Investigator" error beside an already-valid PI.
export const COLLAB_FIELD_KEYS = ['title', 'datasets', 'piUserId', 'piName'] as const

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
