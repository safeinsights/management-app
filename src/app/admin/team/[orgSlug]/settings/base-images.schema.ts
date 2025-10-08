import { z } from 'zod'

export const orgBaseImageSchema = z.object({
    name: z.string().nonempty(),
    cmdLine: z.string().nonempty(),
    language: z.enum(['R', 'PYTHON'], { message: 'Language must be R or Python' }),
    url: z.string().nonempty(), //  not url() because docker FROM doesn't have a scheme so isn't a truely valid url
    isTesting: z.boolean().default(false),
})
