import { describe, expect, it } from 'vitest'
import { mockSessionWithTestData } from '@/tests/unit.helpers'
import { onCreateAccountAction } from './create-account.action'
import { db } from '@/database'

describe('Create Account Actions', () => {
    it('onCreateAccountAction creates a new user', async () => {
        const { org } = await mockSessionWithTestData()

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: 'newuser@test.com',
                isResearcher: true,
                isReviewer: true,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        const result = await onCreateAccountAction({ inviteId: invite.id, form })

        expect(result.success).toBe(true)

        const newUser = await db.selectFrom('user').where('email', '=', 'newuser@test.com').executeTakeFirst()
        expect(newUser).toBeDefined()
    })
})
