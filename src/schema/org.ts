import { z } from 'zod'
import { Selectable } from 'kysely'
import { Org as DefinedOrg } from '@/database/types'

export const orgSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, { message: 'Invalid slug: must be all lowercase alphanumeric or dashes' }),
    name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(50, 'Name cannot exceed 50 characters')
        .refine((val) => /\p{L}/u.test(val), {
            message: 'Name must contain at least one alphabetic character',
        })
        .refine((val) => !/^\d+$/.test(val) || /\p{L}/u.test(val), {
            message: 'Name cannot be only numbers',
        }),
    email: z.string().email({ message: 'Invalid email address' }),
    publicKey: z.string().min(1, { message: 'PubKey cannot be blank' }),
    description: z
        .string()
        .max(250, 'Word limit is 250 characters')
        .transform((val) => (val === '' ? null : val)) // Convert empty string to null
        .nullable()
        .optional(),
})

export type ValidatedOrg = z.infer<typeof orgSchema>

export const getNewOrg = (): NewOrg => {
    return {
        slug: '',
        name: '',
        email: '',
        publicKey: '',
        description: null,
    }
}

export type Org = Selectable<DefinedOrg>

export type NewOrg = Omit<Org, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
