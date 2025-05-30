import { z } from 'zod'

export { z }

export const inviteUserSchema = z.object({
    email: z.string().nonempty().email('Invalid email address'),
    role: z.enum(['reviewer', 'researcher', 'multiple'], {
        errorMap: () => ({ message: 'A role must be selected' }),
    }),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
