import { z } from 'zod'
import { WORD_LIMITS, maxWordsRefine } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

// The fields Step 1 actually collects. This is the resolver for the Step 1 form, so it
// must stay in lockstep with what `StudyProposalForm` renders: anything required here
// but not rendered produces an error the user can never see or clear (OTTER-647).
export const step1FieldsSchema = z.object({
    orgSlug: z.string().min(1, { message: 'Data Partner is required' }),
    language: z
        .enum(['R', 'PYTHON'])
        .nullable()
        .superRefine((val, ctx) => {
            if (val === null) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Programming language is required' })
            }
        }),
})

// Step 1 + the fields owned by the Step 2 editor. Not used as a form resolver: it exists
// to carry the shape of `StudyProposalFormValues`.
export const studyProposalFormSchema = step1FieldsSchema.extend({
    title: z
        .string()
        .min(1, { message: 'Title is required' })
        .refine(maxWordsRefine(WORD_LIMITS.title).check, { message: maxWordsRefine(WORD_LIMITS.title).message }),
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
export const draftStudyApiSchema = studyProposalApiSchema
    .extend(step2ProposalApiSchema.shape)
    .partial()
    .extend({ title: z.string().nullable().optional() })
