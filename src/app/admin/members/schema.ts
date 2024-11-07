import { z } from 'zod'
import { Selectable } from 'kysely'
import { Member as DefinedMember } from '@/database/types'

export { zodResolver } from 'mantine-form-zod-resolver'

export const schema = z.object({
    identifier: z.string().regex(/^[a-z][a-z\-]*[a-z]$/, { message: 'Invalid identifier, all lowercase, only dashes' }),
    name: z.string().min(1, { message: 'Name must be provided' }),
    email: z.string().email({ message: 'Invalid email address' }),
    publicKey: z.string().min(1, { message: 'PubKey cannot be blank' }),
})

export type ValidatedMember = z.infer<typeof schema>

export const NEW_MEMBER: NewMember = {
    identifier: '',
    name: '',
    email: '',
    publicKey: '',
}
Object.freeze(NEW_MEMBER)

export type Member = Selectable<DefinedMember>

export type NewMember = Omit<Member, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
