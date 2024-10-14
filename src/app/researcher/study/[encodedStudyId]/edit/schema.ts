import { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(3).max(100),
    piName: z.string().min(3).max(100),
    highlights: z.preprocess((value) => value === 'on', z.boolean()).nullish(),
    eventCapture: z.preprocess((value) => value === 'on', z.boolean()).nullish(),
    outputMimeType: z.string().nullish(),
})

type FormValues = z.infer<typeof schema>

export { schema, type FormValues, zodResolver }
