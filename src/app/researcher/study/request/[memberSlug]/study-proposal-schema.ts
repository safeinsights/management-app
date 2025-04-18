import { capitalize } from 'remeda'
import { z } from 'zod'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE_STR = '10MB'

const validateDocumentFile = (label: string) => {
    return z
        .instanceof(File, { message: 'Study description document is required' })
        .refine((file) => file && file.size > 0, { message: 'Study description document cannot be empty' })
        .refine((file) => file && file.size < MAX_FILE_SIZE, {
            message: `${capitalize(label)} file size must be less than ${MAX_FILE_SIZE_STR}`,
        })
        .refine((file) => ([
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/pdf',
            'text/plain',
        ].includes(file.type)), {
            message: `Only .doc, .docx, and .pdf files are allowed for ${label}`,
        })
}

export const studyProposalInputsSchema = z.object({
    title: z
        .string()
        .min(5, { message: 'Title must be at least 5 characters long' })
        .max(50, { message: 'Title must be less than 50 characters long' }),
    piName: z.string().min(1, { message: 'Principal Investigator name must be present' }).max(100).trim(),
})


export const studyProposalSchema = studyProposalInputsSchema.extend({
    descriptionDocument: validateDocumentFile('description'),
    irbDocument: validateDocumentFile('IRB'),
    agreementDocument: validateDocumentFile('agreement'),
    codeFiles: z
        .array(z.instanceof(File))
        .min(1, { message: 'At least one code file is required.' })
        .max(10, { message: 'No more than 10 code files are allowed.' })
        .refine((files) => files.every((file) => /\.(R|r|rmd)$/.test(file.name)), {
            message: 'Only .R, .r, and .rmd files are allowed for code files.',
        })
        .refine((files) => files.find((file) => file.name == 'main.r'), {
            message: 'a file named main.r must be present.',
        })
}).superRefine((data, ctx) => {
    const totalSize = [
        data.descriptionDocument,
        data.irbDocument,
        data.agreementDocument,
        ...data.codeFiles,
    ].reduce((sum, file) => sum + (file ? file.size : 0), 0)

    if (totalSize > 10 * 1024 * 1024) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Total size of all files must be less than 10MB',
            path: ['totalFileSize'],
        })
    }
})

export type StudyProposalFormValues = z.infer<typeof studyProposalSchema>

export const studyProposalSaveSchema = studyProposalInputsSchema.extend({
    descriptionDocPath: z.string(),
    irbDocPath: z.string(),
    agreementDocPath: z.string(),
})


export type StudyProposalFormValuesWithFileNames = Omit<StudyProposalFormValues, 'descriptionDocument' | 'irbDocument' | 'agreementDocument'> & {
    descriptionDocument: string
    irbDocument: string
    agreementDocument: string
}
