import { z } from 'zod'
import { Selectable } from 'kysely'
import { Org as DefinedOrg } from '@/database/types'

// Settings schemas for different org types
const enclaveSettingsSchema = z.object({
    publicKey: z.string().min(1, { message: 'PubKey cannot be blank' }),
})

const labSettingsSchema = z.object({}).strict() // Empty for now

// Base org schema
const baseOrgSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, { message: 'Invalid slug: must be all lowercase alphanumeric or dashes' }),
    name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(50, 'Name cannot exceed 50 characters')
        .refine((val) => /\p{L}/u.test(val), {
            message: 'Name must contain at least one alphabetic character',
        })
        .refine((val) => !/^\d+$/.test(val), {
            message: 'Name cannot be only numbers',
        }),
    email: z.email({ message: 'Invalid email address' }),
    description: z
        .string()
        .max(250, 'Word limit is 250 characters')
        .transform((val) => (val === '' ? null : val)) // Convert empty string to null
        .nullable()
        .optional(),
})

// Discriminated union schemas
export const enclaveOrgSchema = baseOrgSchema.extend({
    type: z.literal('enclave'),
    settings: enclaveSettingsSchema,
})

export const labOrgSchema = baseOrgSchema.extend({
    type: z.literal('lab'),
    settings: labSettingsSchema,
})

export const orgSchema = z.discriminatedUnion('type', [enclaveOrgSchema, labOrgSchema])

export const updateOrgSchema = z.discriminatedUnion('type', [
    enclaveOrgSchema.extend({ id: z.string() }),
    labOrgSchema.extend({ id: z.string() }),
])

export type ValidatedOrg = z.infer<typeof orgSchema>

export const getNewOrg = (type: 'enclave' | 'lab' = 'enclave'): NewOrg => {
    return {
        slug: '',
        name: '',
        email: '',
        type,
        settings: type == 'enclave' ? { publicKey: '' } : '',
        description: null,
    }
}

export type Org = Selectable<DefinedOrg>

export type NewOrg = Omit<Org, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
