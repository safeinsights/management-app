import { z } from 'zod'

export const orgBaseImageSchema = z.object({
    name: z.string(),
    cmdLine: z.string(),
    language: z.enum(['R'], { message: 'Language must be R' }),
    url: z.string().url('Must be a valid URL').min(1, 'URL is required'),
    isTesting: z.boolean().default(false),
})
