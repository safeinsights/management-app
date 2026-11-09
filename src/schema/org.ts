import { z } from 'zod'
import { Selectable } from 'kysely'
import { Org as DefinedOrg } from '@/database/types'
import { countCharacters } from '@/lib/field-limits'

export const ORG_NAME_MAX_CHARACTERS = 50
export const ORG_DESCRIPTION_MAX_CHARACTERS = 250

// Measured like the on-screen counter, so they cannot disagree (OTTER-737).
export const orgNameField = z
    .string()
    .trim()
    .min(1, 'Name is required')
    .refine((val) => countCharacters(val) <= ORG_NAME_MAX_CHARACTERS, {
        error: `Name cannot exceed ${ORG_NAME_MAX_CHARACTERS} characters`,
    })

export const orgDescriptionField = z.string().refine((val) => countCharacters(val) <= ORG_DESCRIPTION_MAX_CHARACTERS, {
    error: `Description cannot exceed ${ORG_DESCRIPTION_MAX_CHARACTERS} characters`,
})

const enclaveSettingsSchema = z.object({
    publicKey: z.string().min(1, { error: 'PubKey cannot be blank' }),
})

const labSettingsSchema = z.object({}).strict()

const baseOrgSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, { error: 'Invalid slug: must be all lowercase alphanumeric or dashes' }),
    name: orgNameField
        .refine((val) => /\p{L}/u.test(val), {
            error: 'Name must contain at least one alphabetic character',
        })
        .refine((val) => !/^\d+$/.test(val), {
            error: 'Name cannot be only numbers',
        }),
    email: z.email({ error: 'Invalid email address' }),
    description: orgDescriptionField
        .transform((val) => (val === '' ? null : val))
        .nullable()
        .optional(),
})

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
    enclaveOrgSchema.omit({ slug: true }).extend({ id: z.string() }),
    labOrgSchema.omit({ slug: true }).extend({ id: z.string() }),
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

// Readable by any authenticated user, so it deliberately excludes `settings`, which holds an
// enclave's publicKey, and `email` (OTTER-724 / MA-6).
export type PublicOrg = Pick<Org, 'id' | 'slug' | 'name' | 'type' | 'description'>

export type NewOrg = Omit<Org, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
