import { z } from 'zod'

// TODO Move to @/schema/study.ts

const schema = z
    .object({
        title: z.string().min(3).max(100),
        piName: z.string().min(3).max(1500),
        highlights: z.boolean().nullish(), // .preprocess((value) => value === 'on', z.boolean()).nullish(),
        eventCapture: z.boolean().nullish(),
        outputMimeType: z.string().nullish(),
        irbDocument: z.string().nullish(),
        containerLocation: z.string().min(3).max(250),
    })
    .refine(
        (data) => {
            return Boolean(data.highlights || data.eventCapture)
        },
        {
            message: 'At least one checkbox must be selected',
            path: ['dataSources'],
        },
    )

type FormValues = z.infer<typeof schema>

export { schema, type FormValues }
