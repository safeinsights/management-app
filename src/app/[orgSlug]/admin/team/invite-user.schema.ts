import { z } from 'zod'

export { z }

export const inviteUserSchema = z.object({
    email: z.string().nonempty().email('Invalid email address'),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
