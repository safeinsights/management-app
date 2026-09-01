import { z } from 'zod'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'

// Shared by Step 1 and the CHANGE-REQUESTED resubmit page (OTTER-690, OTTER-737).
export const STUDY_TITLE_MAX_CHARACTERS = 60

export const STUDY_TITLE_BLANK_ERROR = 'Enter a study title before continuing.'
export const STUDY_TITLE_OVER_LIMIT_ERROR = overCharacterLimitError('Study title', STUDY_TITLE_MAX_CHARACTERS)
export const DATA_PARTNER_REQUIRED_ERROR = 'Select a Data Partner before continuing.'
export const PROGRAMMING_LANGUAGE_REQUIRED_ERROR = 'Select a programming language before continuing.'

// Measured trimmed so it matches the on-screen counter; the blank message is a parameter because
// the two pages word it differently.
export const studyTitleField = (blankError: string) =>
    z.string().superRefine((val, ctx) => {
        if (val.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: blankError })
        } else if (countCharacters(val) > STUDY_TITLE_MAX_CHARACTERS) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: STUDY_TITLE_OVER_LIMIT_ERROR })
        }
    })

// Must stay in lockstep with what SetupForm renders: anything required here but not rendered
// produces an error the user can never see or clear (OTTER-647).
const step1FieldsObject = z.object({
    title: studyTitleField(STUDY_TITLE_BLANK_ERROR),
    orgSlug: z.string().min(1, { message: DATA_PARTNER_REQUIRED_ERROR }),
    language: z.enum(['R', 'PYTHON']).nullable(),
})

export const step1FieldsSchema = step1FieldsObject.superRefine((values, ctx) => {
    // Conditional because the language field renders nothing until a Data Partner is chosen; an
    // unconditional rule would flag a field that is not on the page (OTTER-647).
    if (values.orgSlug && values.language === null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['language'],
            message: PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
        })
    }
})

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
    // Trimmed before the length rules so the cap excludes surrounding whitespace (OTTER-737).
    title: z
        .string()
        .trim()
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

// Deliberately uncapped: this serves autosave, and an older study can hold an over-long title a
// cap would reject inside `.params()`. The cap belongs on the submit paths (OTTER-737).
export const draftStudyApiSchema = studyProposalApiSchema
    .extend(step2ProposalApiSchema.shape)
    .partial()
    // Trimmed so the row stores what the counter measured.
    .extend({ title: z.string().trim().nullable().optional() })
