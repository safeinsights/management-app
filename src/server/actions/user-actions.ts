'use server'

import { db } from '@/database'

export const findOrCreateSiUserId = async (clerkId: string, name: string) => {
    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkId)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                name,
                clerkId,
                isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}

export const createUserAction = async (
  clerkId: string,
  name: string,
  isResearcher: boolean
) => {
  const [newUser] = await db
    .insertInto('user')
    .values({
      clerk_id: clerkId,
      name, // using the provided full name
      is_researcher: isResearcher,
    })
    .returningAll()
    .execute()
  if (!newUser) {
    throw new Error('Failed to create user in DB')
  }
  return newUser
}
