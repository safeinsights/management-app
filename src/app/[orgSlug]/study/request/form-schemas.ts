import { capitalize } from 'remeda'
import { z } from 'zod'
import { WORD_LIMITS, maxWordsRefine } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE_STR = '10MB'

const validateDocumentFile = (label: string) => {
    return z
        .union([z.instanceof(File, { message: 'Study description document is required' }), z.null()])
        .refine((file) => file && file.size > 0, { message: 'Study description document cannot be empty' })
        .refine((file) => file && file.size < MAX_FILE_SIZE, {
            message: `${capitalize(label)} file size must be less than ${MAX_FILE_SIZE_STR}`,
        })
        .refine(
            (file) =>
                file &&
                [
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/pdf',
                    'text/plain',
                ].includes(file.type),
            {
                message: `Only .doc, .docx, and .pdf files are allowed for ${label}`,
            },
        )
}

export const studyProposalFormSchema = z
    .object({
        orgSlug: z.string().min(1, { message: 'Data organization is required' }),
        language: z
            .enum(['R', 'PYTHON'])
            .nullable()
            .superRefine((val, ctx) => {
                if (val === null) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Programming language is required' })
                }
            }),
        title: z
            .string()
            .min(1, { message: 'Title is required' })
            .refine(maxWordsRefine(WORD_LIMITS.title).check, { message: maxWordsRefine(WORD_LIMITS.title).message }),
        piName: z.string().max(100, { message: 'Word limit is 100 characters' }).trim(),
        description: z.string().optional(),
        descriptionDocument: validateDocumentFile('description'),
        irbDocument: validateDocumentFile('IRB'),
        agreementDocument: validateDocumentFile('agreement'),
    })
    .superRefine((data, ctx) => {
        const totalSize = [data.descriptionDocument, data.irbDocument, data.agreementDocument].reduce(
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
    | 'title'
    | 'descriptionDocument'
    | 'irbDocument'
    | 'agreementDocument'
    | 'piName'
    | 'orgSlug'
    | 'stepIndex'
    | 'createdStudyId'
    | 'ideMainFile'
    | 'ideFiles'
>

export const studyProposalApiSchema = z.object({
    title: z
        .string()
        .min(1, { message: 'Title is required' })
        .refine(maxWordsRefine(WORD_LIMITS.title).check, { message: maxWordsRefine(WORD_LIMITS.title).message }),
    piName: z.string().max(100).trim(),
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

export const draftStudyApiSchema = studyProposalApiSchema.extend(step2ProposalApiSchema.shape).partial()

export const formReadinessSchema = z.object({
    orgSlug: z.string().min(1),
    language: z.enum(['R', 'PYTHON']),
    title: z.string().min(1).refine(maxWordsRefine(WORD_LIMITS.title).check),
    hasDescriptionDocument: z.literal(true),
    hasIrbDocument: z.literal(true),
    hasAgreementDocument: z.literal(true),
})

// OpenStax step 1 only requires org + language selection
export const openStaxStep1ReadinessSchema = z.object({
    orgSlug: z.string().min(1),
    language: z.enum(['R', 'PYTHON']),
})

export type FormReadinessInput = z.infer<typeof formReadinessSchema>
