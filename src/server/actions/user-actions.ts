import { db } from '@/database'

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('memberUserPublicKey')
        .innerJoin('user', 'memberUserPublicKey.userId', 'user.id')
        .select(['memberUserPublicKey.value as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}
