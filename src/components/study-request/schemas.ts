import { capitalize } from 'remeda'
import { z } from 'zod'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE_STR = '10MB'

// ============================================================================
// Document File Validation
// ============================================================================

const validateDocumentFile = (label: string) => {
    return z
        .union([z.instanceof(File, { message: `${capitalize(label)} document is required` }), z.null()])
        .refine((file) => file && file.size > 0, { message: `${capitalize(label)} document cannot be empty` })
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

// ============================================================================
// Proposal Form Schema (Step 1 - Study Metadata + Documents)
// ============================================================================

export const proposalFormSchema = z
    .object({
        orgSlug: z.string().min(1, { message: 'Data organization is required' }),
        language: z
            .enum(['R', 'PYTHON'])
            .nullable()
            .refine((val) => val !== null, { message: 'Programming language is required' }),
        title: z
            .string()
            .min(5, { message: 'Title must be at least 5 characters long' })
            .max(50, { message: 'Word limit is 50 characters' }),
        piName: z.string().max(100, { message: 'Word limit is 100 characters' }).trim(),
        descriptionDocument: validateDocumentFile('description'),
        irbDocument: validateDocumentFile('IRB'),
        agreementDocument: validateDocumentFile('agreement'),
    })
    .superRefine((data, ctx) => {
        const totalSize = [data.descriptionDocument, data.irbDocument, data.agreementDocument].reduce(
            (sum, file) => sum + (file ? file.size : 0),
            0,
        )

        if (totalSize > MAX_FILE_SIZE) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'The total size of all documents must not exceed 10 MB, please adjust your files accordingly.',
                path: ['totalFileSize'],
            })
        }
    })

export type ProposalFormValues = z.infer<typeof proposalFormSchema>

// ============================================================================
// Code Files Schema (Step 2 - Code Upload)
// ============================================================================

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

        if (totalSize > MAX_FILE_SIZE) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'The total size of all code files must not exceed 10 MB, please adjust your files accordingly.',
                path: ['totalFileSize'],
            })
        }
    })

export type CodeFilesFormValues = z.infer<typeof codeFilesSchema>

// ============================================================================
// API Schemas (for server actions)
// ============================================================================

export const studyProposalApiSchema = z.object({
    title: z
        .string()
        .min(5, { message: 'Title must be at least 5 characters long' })
        .max(50, { message: 'Title must be less than 50 characters long' }),
    piName: z.string().max(100).trim(),
    language: z.enum(['R', 'PYTHON']),
    descriptionDocPath: z.string(),
    irbDocPath: z.string(),
    agreementDocPath: z.string(),
    mainCodeFilePath: z.string(),
    additionalCodeFilePaths: z.array(z.string()),
})

export const draftStudyApiSchema = studyProposalApiSchema.partial()

// ============================================================================
// Legacy Types (for backward compatibility during migration)
// ============================================================================

// Combined schema for existing code that expects all fields together
export const legacyStudyProposalFormSchema = z.intersection(
    proposalFormSchema,
    z.object({
        mainCodeFile: z.union([z.instanceof(File), z.null()]),
        additionalCodeFiles: z.array(z.instanceof(File)),
        stepIndex: z.number(),
        createdStudyId: z.string().nullable(),
        ideMainFile: z.string(),
        ideFiles: z.array(z.string()),
    }),
)

export type LegacyStudyProposalFormValues = z.infer<typeof legacyStudyProposalFormSchema>

// Alias for backward compatibility
export const studyProposalFormSchema = proposalFormSchema
export type StudyProposalFormValues = LegacyStudyProposalFormValues
export type StudyJobCodeFilesValues = CodeFilesFormValues
