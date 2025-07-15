import { expect, it, faker, db, mockSessionWithTestData, type Mock } from '@/tests/unit.helpers'
import { onCreateAccountAction } from './create-account.action'

it('returns ActionFailure when email already exists in Clerk', async () => {
    const { org, client } = await mockSessionWithTestData()

    const inviteId = faker.string.uuid()
    const email = 'duplicate@example.com'

    await db
        .insertInto('pendingUser')
        .values({
            id: inviteId,
            orgId: org.id,
            email,
            isResearcher: true,
            isReviewer: false,
        })
        .execute()
    ;(client.users.getUserList as Mock).mockResolvedValue({ data: [{ id: 'user_123' }] })

    await expect(
        onCreateAccountAction({
            inviteId,
            form: { firstName: 'a', lastName: 'b', password: 'Abcdef12!', confirmPassword: 'Abcdef12!' },
        }),
    ).rejects.toMatchObject({
        message: expect.stringContaining('already associated'),
    })
})

it('creates a new user when email does not exist', async () => {
    const { org, client } = await mockSessionWithTestData()

    const inviteId = faker.string.uuid()
    const email = 'new@example.com'

    await db
        .insertInto('pendingUser')
        .values({
            id: inviteId,
            orgId: org.id,
            email,
            isResearcher: true,
            isReviewer: false,
        })
        .execute()
    ;(client.users.getUserList as Mock).mockResolvedValue({ data: [] })
    ;(client.users.createUser as Mock).mockResolvedValue({ id: 'new_user_id' })

    await onCreateAccountAction({
        inviteId,
        form: { firstName: 'a', lastName: 'b', password: 'Abcdef12!', confirmPassword: 'Abcdef12!' },
    })

    expect(client.users.createUser).toHaveBeenCalled()
})
