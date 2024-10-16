import { Member } from '@/lib/types'
import { db } from '@/database'

export const getMemberFromIdentifier = async (identier: string): Promise<Member | undefined> => {
    return await db
        .selectFrom('member')
        .select(['id', 'name', 'publicKey', 'email', 'identifier'])
        .where('identifier', '=', identier)
        .executeTakeFirst()
}
