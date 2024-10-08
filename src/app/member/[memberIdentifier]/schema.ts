import { z } from 'zod'

export const schema = z.object({
    title: z
        .string()
        .min(10, { message: 'Title must be at least 10 characters long' })
        .max(120, { message: 'Title must be less than 120 characters long' }),
})

export type FormValues = z.infer<typeof schema>
