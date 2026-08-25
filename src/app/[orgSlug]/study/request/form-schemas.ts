import { z } from 'zod'
import { WORD_LIMITS, maxWordsRefine } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

/**
 * OTTER-690: Step 1 owns `study.title` for DRAFT studies, capped at characters rather than
 * words. The CHANGE-REQUESTED resubmit flow keeps its own 20-word rule (`WORD_LIMITS.title`);
 * the two are deliberately different and harmonizing them is a separate card.
 */
export const STUDY_TITLE_MAX_CHARACTERS = 60

export const STUDY_TITLE_BLANK_ERROR = 'Enter a study title before continuing.'
export const STUDY_TITLE_OVER_LIMIT_ERROR = `Study title exceeds the ${STUDY_TITLE_MAX_CHARACTERS} character limit. Shorten it to continue.`
export const DATA_PARTNER_REQUIRED_ERROR = 'Select a Data Partner before continuing.'
export const PROGRAMMING_LANGUAGE_REQUIRED_ERROR = 'Select a programming language before continuing.'

// Emptiness is measured trimmed, the cap is measured RAW. Mixing them lets "60 characters plus
// a trailing space" show 61/60 in the counter while still validating, because the counter counts
// what the user typed. Trimming happens once, when the draft is persisted (use-save-draft).
const studyTitleField = z.string().superRefine((val, ctx) => {
    if (val.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: STUDY_TITLE_BLANK_ERROR })
    } else if (val.length > STUDY_TITLE_MAX_CHARACTERS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: STUDY_TITLE_OVER_LIMIT_ERROR })
    }
})

// The fields Step 1 actually collects. This is the resolver for the Step 1 form, so it
// must stay in lockstep with what `SetupForm` renders: anything required here
// but not rendered produces an error the user can never see or clear (OTTER-647).
const step1FieldsObject = z.object({
    title: studyTitleField,
    orgSlug: z.string().min(1, { message: DATA_PARTNER_REQUIRED_ERROR }),
    language: z.enum(['R', 'PYTHON']).nullable(),
})

export const step1FieldsSchema = step1FieldsObject.superRefine((values, ctx) => {
    // Conditional, not a field rule: the programming-language field renders nothing until a Data
    // Partner is chosen, so an unconditional rule would report an error on a field that is not on
    // the page. That is the OTTER-647 failure mode, and it makes Continue flag nothing and do
    // nothing.
    if (values.orgSlug && values.language === null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['language'],
            message: PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
        })
    }
})

// Step 1 + the fields owned by the Step 2 editor. Not used as a form resolver: it exists
// to carry the shape of `StudyProposalFormValues`. Derived from the bare object rather than
// from `step1FieldsSchema`, whose object-level refinement blocks further derivation.
export const studyProposalFormSchema = step1FieldsObject.extend({
    piName: z.string().max(100, { message: 'Name cannot exceed 100 characters' }).trim(),
    description: z.string().optional(),
})

export const codeFilesSchema = z
    .object({
        mainCodeFile: z.union([z.instanceof(File, { message: 'Main code file is required' }), z.null()]).refine(
            (file) => {
                if (file === null) return false
                return /\.(R|r|rmd|py|ipynb)$/i.test(file.name)
            },
            {
                message: 'Only .R, .r, .rmd, .py, and .ipynb files are allowed for code files.',
            },
        ),
        additionalCodeFiles: z
            .array(z.instanceof(File))
            .max(10, { message: 'No more than 10 code files are allowed.' })
            .refine((files) => files.every((file) => /\.(R|r|rmd|json|csv|txt|py|ipynb)$/.test(file.name)), {
                message: 'Only .R, .r, .rmd, .json, .csv, .txt, .py, and .ipynb files are allowed for code files.',
            }),
    })
    .superRefine((data, ctx) => {
        const totalSize = [data.mainCodeFile, ...data.additionalCodeFiles].reduce(
            (sum, file) => sum + (file ? file.size : 0),
            0,
        )

        if (totalSize > 10 * 1024 * 1024) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'The total size of all documents must not exceed 10 MB, please adjust your files accordingly.',
                path: ['totalFileSize'],
            })
        }
    })

export const ideFilesSchema = z.object({
    stepIndex: z.number(),
    createdStudyId: z.string().nullable(),
    ideMainFile: z.string(),
    ideFiles: z.array(z.string()),
})

export const StudyProposalActionSchema = z.intersection(
    z.intersection(studyProposalFormSchema, codeFilesSchema),
    ideFilesSchema,
)

export type StudyJobCodeFilesValues = z.infer<typeof codeFilesSchema>
export type StudyProposalFormValues = z.infer<typeof StudyProposalActionSchema>
export type ResubmitProposalFormValues = Omit<
    StudyProposalFormValues,
    'title' | 'piName' | 'orgSlug' | 'stepIndex' | 'createdStudyId' | 'ideMainFile' | 'ideFiles'
>

export const studyProposalApiSchema = z.object({
    title: z
        .string()
        .min(1, { message: 'Title is required' })
        .refine(maxWordsRefine(WORD_LIMITS.title).check, { message: maxWordsRefine(WORD_LIMITS.title).message }),
    piName: z.string().max(100).trim(),
    piUserId: z.string().uuid(),
    language: z.enum(['R', 'PYTHON']),
    descriptionDocPath: z.string(),
    irbDocPath: z.string(),
    agreementDocPath: z.string(),
    mainCodeFilePath: z.string(),
    additionalCodeFilePaths: z.array(z.string()),
})

export const step2ProposalApiSchema = z.object({
    datasets: z.array(z.string()),
    researchQuestions: z.string(),
    projectSummary: z.string(),
    impact: z.string(),
    additionalNotes: z.string(),
})

// Drafts allow `title: null` so a researcher can save without filling it in;
// the DB enforces non-null only when status leaves DRAFT.
//
// Deliberately permissive about title length. This schema is shared by three server entry
// points, and only one of them is a Step 1 owner: `onUpdateDraftStudyAction` also serves the
// resubmit autosave and `resubmitProposalAction` serves resubmission itself, both on
// CHANGE-REQUESTED rows where the 20-word rule still applies. A character cap here would
// reject titles the resubmit UI accepted. Step 1's cap lives in `step1DraftStudyApiSchema`.
export const draftStudyApiSchema = studyProposalApiSchema
    .extend(step2ProposalApiSchema.shape)
    .partial()
    .extend({ title: z.string().nullable().optional() })

// Step 1 study creation only. `draftStudyApiSchema` replaces `title` outright, so tightening
// its parent would silently be a no-op; the rule has to be applied to the override.
//
// Required and non-blank, unlike the parent's nullable/optional title: this is the one entry point
// that mints a study row, and every untitled row it creates is one the recovery guards in
// /proposal and `finalizeStudySubmissionAction` then have to rescue. Step 1's Save & continue gate
// already makes a blank create unreachable through the UI; requiring it here means a future caller
// cannot reintroduce the case by forgetting. Rows predating OTTER-690 still need those guards.
//
// Cap before blank, so the message matches what the user did: 61 characters reports the limit,
// while whitespace-only reports the blank rule. Emptiness is measured trimmed, matching
// `studyTitleField`; the client trims before sending.
export const step1DraftStudyApiSchema = draftStudyApiSchema.extend({
    title: z
        .string()
        .max(STUDY_TITLE_MAX_CHARACTERS, { message: STUDY_TITLE_OVER_LIMIT_ERROR })
        .refine((val) => val.trim().length > 0, { message: STUDY_TITLE_BLANK_ERROR }),
})
