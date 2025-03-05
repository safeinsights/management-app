import { z } from 'zod'
import { Selectable } from 'kysely'
import { User as MemberUser } from '@/database/types'

export type Study = Selectable<DefinedStudy>

export { zodResolver } from 'mantine-form-zod-resolver'

export const memberUserSchema = z.object({
    identifier: z.string().regex(/^[a-z][a-z\-]*[a-z]$/, { message: 'Invalid identifier, all lowercase, only dashes' }),
    name: z.string().min(1, { message: 'Name must be provided' }),
    email: z.string().email({ message: 'Invalid email address' }),
    publicKey: z.string().min(1, { message: 'PubKey cannot be blank' }),
})

export type ValidatedMemberUser = z.infer<typeof memberUserSchema>

export const getNewMemberUser = (): NewMember => {
    return {
        identifier: '',
        name: '',
        email: '',
        publicKey: '',
    }
}

export type User = Selectable<MemberUser>

export type NewMember = Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: never; updatedAt?: never }
