import { z } from 'zod'

export { zodResolver } from 'mantine-form-zod-resolver'

export const inviteUserSchema = z.object({
    firstName: z.string().nonempty('Name is required'),
    lastName: z.string().nonempty('Name is required'),
    email: z.string().nonempty().email("This is not a valid email."),
    password: z.string().nonempty('password is required'),
    isReviewer: z.boolean().optional(),
    isResearcher: z.boolean().optional(),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
