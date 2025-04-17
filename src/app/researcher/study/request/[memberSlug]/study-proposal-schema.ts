import { z } from 'zod'

export { zodResolver } from 'mantine-form-zod-resolver'

export const studyProposalSchema = z
    .object({
        title: z
            .string()
            .min(5, { message: 'Title must be at least 5 characters long' })
            .max(50, { message: 'Title must be 50 characters long or less' }),
        piName: z
            .string()
            .min(1, { message: 'Principal Investigator name must be present' })
            .max(100, { message: 'Principal Investigator name must be 100 characters long or less' })
            .trim(),
        descriptionDocument: z
            .union([z.instanceof(File, { message: 'Study description document is required' }), z.null()])
            .refine((file) => file && file.size > 0, { message: 'Study description document cannot be empty' })
            .refine((file) => file && file.size < 10 * 1024 * 1024, {
                message: 'Description file size must be less than 10MB',
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
                    message: 'Only .doc, .docx, and .pdf files are allowed for description',
                },
            ),
        irbDocument: z
            .union([z.instanceof(File, { message: 'IRB document is required' }), z.null()])
            .refine((file) => file && file.size > 0, { message: 'IRB document cannot be empty' })
            .refine((file) => file && file.size < 10 * 1024 * 1024, {
                message: 'IRB document size must be less than 10MB',
            })
            .refine(
                (file) =>
                    file &&
                    [
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/pdf',
                    ].includes(file.type),
                {
                    message: 'Only .doc, .docx, and .pdf files are allowed for IRB document',
                },
            ),
        agreementDocument: z
            .union([z.instanceof(File, { message: 'Agreement document is required' }), z.null()])
            .refine((file) => file && file.size > 0, { message: 'Agreement document cannot be empty' })
            .refine((file) => file && file.size < 10 * 1024 * 1024, {
                message: 'Agreement document size must be less than 10MB',
            })
            .refine(
                (file) =>
                    file &&
                    [
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/pdf',
                    ].includes(file.type),
                {
                    message: 'Only .doc, .docx, and .pdf files are allowed for Agreement document',
                },
            ),
        codeFiles: z
            .array(z.instanceof(File))
            .min(1, { message: 'At least one code file is required.' })
            .max(10, { message: 'No more than 10 code files are allowed.' })
            .refine((files) => files.every((file) => /\.(R|r|rmd)$/.test(file.name)), {
                message: 'Only .R, .r, and .rmd files are allowed for code files.',
            }),
    })
    .superRefine((data, ctx) => {
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
