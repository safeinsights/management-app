import { z } from 'zod'
import { overCharacterLimitError } from '@/lib/field-limits'

/**
 * Step 1 owns `study.title` for DRAFT studies (OTTER-690). The CHANGE-REQUESTED resubmit page
 * renders a title too and now shares this cap (OTTER-737), so the constant lives here, beside the
 * form that creates the study, and both flows import it.
 */
export const STUDY_TITLE_MAX_CHARACTERS = 60

export const STUDY_TITLE_BLANK_ERROR = 'Enter a study title before continuing.'
export const STUDY_TITLE_OVER_LIMIT_ERROR = overCharacterLimitError('Study title', STUDY_TITLE_MAX_CHARACTERS)
export const DATA_PARTNER_REQUIRED_ERROR = 'Select a Data Partner before continuing.'
export const PROGRAMMING_LANGUAGE_REQUIRED_ERROR = 'Select a programming language before continuing.'

/**
 * The study title rule, shared by Step 1 and the CHANGE-REQUESTED resubmit page (OTTER-737).
 *
 * Emptiness is measured trimmed, the cap is measured RAW. Mixing them lets "60 characters plus
 * a trailing space" show 61/60 in the counter while still validating, because the counter counts
 * what the user typed. Trimming happens once, when the draft is persisted (use-save-draft).
 *
 * The blank message is a parameter because the two pages word it differently. Step 1 names the
 * action, since it raises every empty-field message at once; the resubmit page keeps the generic
 * wording it shares with its other fields. The over-limit message is the same on both.
 */
export const studyTitleField = (blankError: string) =>
    z.string().superRefine((val, ctx) => {
        if (val.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: blankError })
        } else if (val.length > STUDY_TITLE_MAX_CHARACTERS) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: STUDY_TITLE_OVER_LIMIT_ERROR })
        }
    })

// The fields Step 1 actually collects. This is the resolver for the Step 1 form, so it
// must stay in lockstep with what `SetupForm` renders: anything required here
// but not rendered produces an error the user can never see or clear (OTTER-647).
const step1FieldsObject = z.object({
    title: studyTitleField(STUDY_TITLE_BLANK_ERROR),
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
        .max(STUDY_TITLE_MAX_CHARACTERS, { message: STUDY_TITLE_OVER_LIMIT_ERROR }),
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
// The cap applies to every entry point this schema serves. It used to be deliberately absent,
// because `onUpdateDraftStudyAction` also serves the resubmit autosave and `resubmitProposalAction`
// serves resubmission itself, and those ran on CHANGE-REQUESTED rows under a 20-word title rule
// that a character cap could have rejected. Both flows are on the same 60 characters now
// (OTTER-737), so there is nothing left to reject.
export const draftStudyApiSchema = studyProposalApiSchema
    .extend(step2ProposalApiSchema.shape)
    .partial()
    .extend({
        title: z
            .string()
            .max(STUDY_TITLE_MAX_CHARACTERS, { message: STUDY_TITLE_OVER_LIMIT_ERROR })
            .nullable()
            .optional(),
    })
