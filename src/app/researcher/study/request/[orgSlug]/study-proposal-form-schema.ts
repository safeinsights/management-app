import { z } from 'zod'
import { capitalize } from 'remeda'
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
        title: z
            .string()
            .min(5, { message: 'Title must be at least 5 characters long' })
            .max(50, { message: 'Word limit is 50 characters' }),
        piName: z
            .string()
            .min(1, { message: 'Principal Investigator name must be present' })
            .max(100, { message: 'Word limit is 100 characters' })
            .trim(),
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
                message: 'Total size of all files must be less than 10MB',
                path: ['totalFileSize'],
            })
        }
    })

export const codeFilesSchema = z
    .object({
        mainCodeFile: z.union([z.instanceof(File, { message: 'Main code file is required' }), z.null()]).refine(
            (file) => {
                if (file === null) return true // allow null value
                return /\.r$/i.test(file.name)
            },
            {
                message: 'Only .R, .r, and .rmd files are allowed for code files.',
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
                message: 'Total size of all files must be less than 10MB',
                path: ['totalFileSize'],
            })
        }
    })

export const StudyProposalActionSchema = z.intersection(studyProposalFormSchema, codeFilesSchema)

export type StudyProposalFormValues = z.infer<typeof StudyProposalActionSchema>

export const studyProposalApiSchema = z.object({
    title: z
        .string()
        .min(5, { message: 'Title must be at least 5 characters long' })
        .max(50, { message: 'Title must be less than 50 characters long' }),
    piName: z.string().min(1, { message: 'Principal Investigator name must be present' }).max(100).trim(),
    descriptionDocPath: z.string(),
    irbDocPath: z.string(),
    agreementDocPath: z.string(),
    mainCodeFilePath: z.string(),
    additionalCodeFilePaths: z.array(z.string()),
})
