'use server'

import { db } from '@/database'

export const getUserIdByClerkId = async (clerkId: string) => {
    const user = await db.selectFrom('user').select('id').where('clerkId', '=', clerkId).executeTakeFirst()

    return user?.id || null
}
