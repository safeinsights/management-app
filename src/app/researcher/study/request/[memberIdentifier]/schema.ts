import { z } from 'zod'

export { zodResolver } from 'mantine-form-zod-resolver'

export const schema = z.object({
    title: z
        .string()
        .min(5, { message: 'Title must be at least 5 characters long' })
        .max(120, { message: 'Title must be less than 120 characters long' }),
    description: z.string().min(1, { message: 'Description name must be present' }),
    piName: z.string().min(1, { message: 'Principal Investigator name must be present' }).max(100).trim(),
})

export type FormValues = z.infer<typeof schema>
