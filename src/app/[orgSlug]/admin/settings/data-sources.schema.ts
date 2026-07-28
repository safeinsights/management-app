import { z } from 'zod'

const dataSourceUrlSchema = z.object({
    id: z.uuid().optional(),
    url: z.url('Enter a valid URL'),
    description: z.string().trim().nonempty('URL description is required'),
})

const dataSourceFieldsSchema = z.object({
    name: z.string().nonempty('Name is required'),
    description: z.string().optional().or(z.literal('')),
    urls: z.array(dataSourceUrlSchema),
})

const newUrlFieldsSchema = z.object({
    newUrl: z.string(),
    newUrlDescription: z.string(),
})

export const createOrgDataSourceSchema = dataSourceFieldsSchema

export const editOrgDataSourceSchema = dataSourceFieldsSchema

// The draft URL pair is optional, but a half-filled one is not: `addUrl` and submit both
// fold it into `urls`, where the stricter row schema applies. Validating it here surfaces
// the problem on the field the user typed in rather than only in the server action.
export const dataSourceFormSchema = z
    .object({
        ...dataSourceFieldsSchema.shape,
        ...newUrlFieldsSchema.shape,
    })
    .superRefine((data, ctx) => {
        const hasUrl = data.newUrl.trim().length > 0
        const hasDescription = data.newUrlDescription.trim().length > 0

        if (hasUrl && !hasDescription) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'URL description is required',
                path: ['newUrlDescription'],
            })
        }
        if (hasDescription && !hasUrl) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid URL', path: ['newUrl'] })
        }
        if (hasUrl && !z.url().safeParse(data.newUrl.trim()).success) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid URL', path: ['newUrl'] })
        }
    })
