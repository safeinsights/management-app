import { z } from 'zod'
import { countCharactersFromLexical, extractTextFromLexical, countWordsFromLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

const WORD_LIMIT_ERROR = 'Word limit exceeded. Please shorten your text.'
const REQUIRED_FIELD_ERROR = 'This field is required.'

export const WORD_LIMITS = {
    title: 20,
    researchQuestions: 500,
    projectSummary: 1000,
    impact: 500,
    additionalNotes: 300,
} as const

/**
 * Step 2's per-field caps, in characters (OTTER-691). Figma shows these as the counters beside each
 * field: 3000 / 6000 / 3000 / 1800.
 *
 * Deliberately separate from {@link WORD_LIMITS}, which stays in force on the CHANGE-REQUESTED
 * resubmit page. The two flows now measure the same four fields differently; that divergence is
 * intended for this card and is worth a follow-up to harmonize.
 */
export const CHARACTER_LIMITS = {
    researchQuestions: 3000,
    projectSummary: 6000,
    impact: 3000,
    additionalNotes: 1800,
} as const

/** Field titles, kept here so the schema's messages and the rendered labels cannot drift. */
export const FIELD_TITLES = {
    researchQuestions: 'Research question(s)',
    projectSummary: 'Project summary',
    impact: 'Impact',
    additionalNotes: 'Additional notes or requests',
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

const PI_UNLINKED_ERROR = 'Select a Principal Investigator from the list.'

/**
 * Whether a PI id links to a real user. Shared with `missingProposalFields` so the submit gate and
 * the outstanding-fields hint cannot drift: a non-empty id that is not a UUID fails the schema, so
 * a hint that only checked for non-emptiness would leave submit disabled with nothing named.
 */
export const isLinkedPiUserId = (piUserId: string | undefined) => z.uuid().safeParse(piUserId).success

/**
 * The linked-PI rule, lifted out of the schema body so the full and DRAFT-only variants below
 * cannot drift. The PI must be a linked user, not just a name: downstream reviewer views key off
 * piUserId to show the researcher profile, and a name without an id renders a PI with no profile.
 * The issue is attached to `piName` because that is the path the Select displays, so the gate is
 * enforceable without being invisible.
 */
const validateLinkedPi = (data: { piName: string; piUserId: string }, ctx: z.RefinementCtx) => {
    if (data.piName && !isLinkedPiUserId(data.piUserId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PI_UNLINKED_ERROR, path: ['piName'] })
    }
}

const proposalFieldsSchema = z.object({
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
    // No rule of its own: no field displays piUserId, so an error on this path is one the user
    // cannot see or clear while it still blocks submit (OTTER-647). `default` also absorbs the
    // `undefined` that hydrating a draft with no PI yields, which a bare `z.string()` rejects.
    piUserId: z.string().default(''),
})

export const proposalFormSchema = proposalFieldsSchema.superRefine(validateLinkedPi)

/**
 * Step 2's empty-field messages (OTTER-691). Each one names the field and the action, because they
 * are raised together when Submit is clicked: five copies of "This field is required." stacked down
 * the page tell the user nothing about which is which.
 *
 * Scoped to the DRAFT resolver below. `proposalFormSchema` keeps the generic wording because the
 * CHANGE-REQUESTED resubmit page shares it and this card does not cover that page.
 */
export const DRAFT_REQUIRED_ERRORS = {
    datasets: 'Select a dataset of interest before continuing.',
    researchQuestions: 'Enter your research questions before continuing.',
    projectSummary: 'Enter your project summary before continuing.',
    impact: 'Enter your proposal impact before continuing.',
    piName: 'Select a Principal Investigator before continuing.',
} as const

/**
 * A Step 2 rich-text field: required (unless `requiredError` is null) and capped in characters.
 *
 * `superRefine` rather than chained `refine`s so an empty field reports only that it is empty. The
 * two rules can both fail at once on a blank field with a huge limit, and stacking two messages
 * under one control reads as a defect.
 *
 * Emptiness is measured trimmed, the cap is measured raw, matching the counter beside the field
 * and the same split OTTER-690 applied to the Step 1 title. Mixing them would let a field read
 * 3000/3000 while validating as 3001.
 */
const draftLexicalField = (fieldTitle: string, requiredError: string | null, maxCharacters: number) =>
    z.string().superRefine((val, ctx) => {
        if (requiredError && extractTextFromLexical(val).trim().length === 0) {
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

/**
 * Step 2's resolver on a DRAFT, where the title lives on Step 1 (OTTER-690) and this page does
 * not render it. A required rule on an unrendered field is a submit blocker nothing can clear
 * (OTTER-647), so the rule is dropped rather than the field: `title` stays in
 * `ProposalFormValues`, `COLLAB_FIELD_KEYS` and `initialProposalValues` because the
 * CHANGE-REQUESTED resubmit flow still edits it, and that flow keeps `proposalFormSchema`.
 *
 * Derived by omitting from the bare object, not from `proposalFormSchema`: zod refuses `.omit()`
 * on an object carrying refinements, and that failure is at module load, not at runtime.
 */
export const draftProposalFormSchema = proposalFieldsSchema
    .omit({ title: true })
    // Overridden rather than redefined from scratch: only the messages differ from the shared
    // shape, and re-declaring every field would let the two drift on everything else.
    .extend({
        datasets: z.array(z.string()).min(1, { message: DRAFT_REQUIRED_ERRORS.datasets }),
        researchQuestions: draftLexicalField(
            FIELD_TITLES.researchQuestions,
            DRAFT_REQUIRED_ERRORS.researchQuestions,
            CHARACTER_LIMITS.researchQuestions,
        ),
        projectSummary: draftLexicalField(
            FIELD_TITLES.projectSummary,
            DRAFT_REQUIRED_ERRORS.projectSummary,
            CHARACTER_LIMITS.projectSummary,
        ),
        impact: draftLexicalField(FIELD_TITLES.impact, DRAFT_REQUIRED_ERRORS.impact, CHARACTER_LIMITS.impact),
        // Optional, but still capped: an over-long note must block Submit even though a blank one
        // does not.
        additionalNotes: draftLexicalField(FIELD_TITLES.additionalNotes, null, CHARACTER_LIMITS.additionalNotes)
            .optional()
            .default(''),
        piName: z.string().min(1, { message: DRAFT_REQUIRED_ERRORS.piName }),
    })
    .superRefine(validateLinkedPi)

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

// The non-lexical proposal fields, synced individually through the Yjs fields map
// (see useYjsFormMap). The lexical editor fields auto-save to Yjs continuously.
// `piUserId` before `piName`: the two are applied in this order when a Yjs document syncs, and
// the cross-field rule below attaches its error to `piName`. Validating the name while the id
// was still empty raised "Select a Principal Investigator from the list", and applying the id
// afterwards only revalidated `piUserId`, leaving that error stranded beside a valid PI.
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
