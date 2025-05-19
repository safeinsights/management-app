import { z } from 'zod'
import { Selectable } from 'kysely'
import { Org as DefinedOrg } from '@/database/types'

export const orgSchema = z.object({
    slug: z.string().regex(/^[a-z][0-9][a-z\-]*[a-z]$/, { message: 'Invalid slug must be all lowercase alphanumeric or dashes' }),
    name: z.string().min(1, { message: 'Name must be provided' }),
    email: z.string().email({ message: 'Invalid email address' }),
    publicKey: z.string().min(1, { message: 'PubKey cannot be blank' }),
})

export type ValidatedOrg = z.infer<typeof orgSchema>

export const getNewOrg = (): NewOrg => {
    return {
        slug: '',
        name: '',
        email: '',
        publicKey: '',
    }
}

export type Org = Selectable<DefinedOrg>

export type NewOrg = Omit<Org, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
