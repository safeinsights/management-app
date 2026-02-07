import { z } from 'zod'

export const step2FormSchema = z.object({
    title: z
        .string()
        .min(1, { message: 'Study title is required' })
        .refine(
            (val) => {
                const wordCount = val.trim().split(/\s+/).filter(Boolean).length
                return wordCount <= 20
            },
            { message: 'Word limit exceeded. Please shorten your text.' }
        ),
    datasets: z.array(z.string()).min(1, { message: 'At least one dataset is required' }),
})

export type Step2FormValues = z.infer<typeof step2FormSchema>

export const initialStep2Values: Step2FormValues = {
    title: '',
    datasets: [],
}
