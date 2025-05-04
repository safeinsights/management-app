import { z } from 'zod'

export const inviteUserSchema = z
    .object({
        email: z.string().nonempty().email('Invalid email address'),
        password: z.string().nonempty(),
        isReviewer: z.boolean(),
        isResearcher: z.boolean(),
        orgSlug: z.string().min(1),
    })
    .superRefine((data, ctx) => {
        if (!data.isReviewer && !data.isResearcher) {
            ctx.addIssue({
                path: ['isResearcher'], // Attach error to one of the fields for UI
                code: z.ZodIssueCode.custom,
                message: 'At least one role (Reviewer or Researcher) must be selected.',
            })
        }
    })

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
