import { z } from 'zod'

export { zodResolver } from 'mantine-form-zod-resolver'

export const schema = z.object({
    title: z
        .string()
        .min(5, { message: 'Title must be at least 5 characters long' })
        .max(50, { message: 'Title must be less than 50 characters long' }),
    description: z
        .instanceof(File, { message: 'Study description document is required' })
        .refine((file) => file.size > 0, { message: 'Study description document cannot be empty' })
        .refine((file) => file.size < 10 * 1024 * 1024, {
            message: 'Description file size must be less than 10MB',
        })
        .refine(
            (file) =>
                [
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/pdf',
                    'text/plain',
                ].includes(file.type),
            {
                message: 'Only .doc, .docx, .pdf, and .txt files are allowed for description',
            },
        ),
    irbDocument: z
        .instanceof(File, { message: 'IRB document is required' })
        .refine((file) => file.size > 0, { message: 'IRB document cannot be empty' })
        .refine((file) => file.size < 10 * 1024 * 1024, {
            message: 'IRB document size must be less than 10MB',
        })
        .refine(
            (file) =>
                [
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/pdf',
                ].includes(file.type),
            {
                message: 'Only .doc, .docx, and .pdf files are allowed for IRB document',
            },
        ),

    // TODO: Need database column for this attribute
    // agreementDocument: z
    //     .instanceof(File, { message: 'Agreement document is required' })
    //     .refine((file) => file.size > 0, { message: 'Agreement document cannot be empty' })
    //     .refine((file) => file.size < 10 * 1024 * 1024, {
    //         message: 'Agreement document size must be less than 10MB',
    //     })
    //     .refine(
    //         (file) =>
    //             [
    //                 'application/msword',
    //                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    //                 'application/pdf',
    //             ].includes(file.type),
    //         {
    //             message: 'Only .doc, .docx, and .pdf files are allowed for agreement document',
    //         },
    //     ),
    piName: z.string().min(1, { message: 'Principal Investigator name must be present' }).max(100).trim(),
})

export type FormValues = z.infer<typeof schema>
