import { z } from 'zod'

export { z }

export const inviteUserSchema = z.object({
    email: z.email('Invalid email address'),
    permission: z.enum(['contributor', 'admin'], {
        error: 'A permission must be selected',
    }),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
