import { z } from 'zod'

export { zodResolver } from 'mantine-form-zod-resolver'

export const inviteUserSchema = z
    .object({
        firstName: z.string().nonempty('is required'),
        lastName: z.string().nonempty('is required'),
        email: z.string().nonempty().email('This is not a valid email.'),
        password: z.string().nonempty('password is required'),
        isReviewer: z.boolean().optional(),
        isResearcher: z.boolean().optional(),
        organizationId: z.string().nonempty('organization must be selected'),
    })
    .superRefine((data, ctx) => {
        if (!data.isReviewer && !data.isResearcher) {
            ctx.addIssue({
                path: ['role'],
                code: z.ZodIssueCode.custom,
                message: 'At least one role must be selected.',
            })
        }
    })

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
