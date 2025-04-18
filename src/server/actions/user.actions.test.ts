import { describe, it, expect } from 'vitest'
import { db } from '@/database'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { insertTestMember, insertTestUser } from '@/tests/unit.helpers'
import { faker } from '@faker-js/faker'

describe('User Actions', () => {
    describe('findOrCreateSiUserId', () => {
        it('returns existing user id when user exists', async () => {
            const member = await insertTestMember()
            const user = await insertTestUser({ member })

            const foundUserId = await findOrCreateSiUserId(user.clerkId)
            expect(foundUserId).toBe(user.id)
        })

        it('creates and returns new user id when user does not exist', async () => {
            const clerkId = faker.string.uuid()
            const userId = await findOrCreateSiUserId(clerkId)
            const foundUser = await db
                .selectFrom('user')
                .select('id')
                .where('clerkId', '=', clerkId)
                .executeTakeFirstOrThrow()
            expect(userId).toEqual(foundUser.id)
        })
    })
})
