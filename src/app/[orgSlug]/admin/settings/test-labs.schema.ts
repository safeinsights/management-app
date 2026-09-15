import { z } from 'zod'

export const designateTestLabsSchema = z.object({
    researchLabIds: z.array(z.uuid()).nonempty('Select at least one research lab'),
})
