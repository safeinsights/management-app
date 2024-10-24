import { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'

const schema = z
    .object({
        title: z.string().min(3).max(100),
        description: z.string().min(3).max(100),
        piName: z.string().min(3).max(100),
        highlights: z.preprocess((value) => value === 'on', z.boolean()).nullish(),
        eventCapture: z.preprocess((value) => value === 'on', z.boolean()).nullish(),
        outputMimeType: z.string().nullish(),
        irbDocument: z.string().nullish(),
        containerLocation: z.string().min(3).max(250),
    })
    .refine((data) => data.highlights || data.eventCapture, {
        message: 'At least one checkbox must be selected',
        path: ['highlights', 'eventCapture'],
    })

type FormValues = z.infer<typeof schema>

export { schema, type FormValues, zodResolver }
