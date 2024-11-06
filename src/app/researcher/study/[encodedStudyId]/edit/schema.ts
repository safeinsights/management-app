import { z } from 'zod'

import { zodResolver } from 'mantine-form-zod-resolver'

const schema = z
    .object({
        title: z.string().min(3).max(100),
        description: z.string().min(3).max(100),
        piName: z.string().min(3).max(100),
        highlights: z.boolean().nullish(), // .preprocess((value) => value === 'on', z.boolean()).nullish(),
        eventCapture: z.boolean().nullish(),
        outputMimeType: z.string().nullish(),
        irbDocument: z.string().nullish(),
        containerLocation: z.string().min(3).max(250),
    })
    .refine((data) => {
        console.log(data)
        return data.highlights || data.eventCapture
    }, {
        message: 'At least one checkbox must be selected',
        path: ['dataSources'],
    })

type FormValues = z.infer<typeof schema>

export { schema, type FormValues, zodResolver }
