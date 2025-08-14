import { z } from 'zod'

export { z }

export const inviteUserSchema = z.object({
    email: z.string().nonempty().email('Invalid email address'),
    role: z.enum(['reviewer', 'researcher', 'multiple'], {
        message: 'A role must be selected',
    }),
    permission: z.enum(['contributor', 'admin'], {
        message: 'A permission must be selected',
    }),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
