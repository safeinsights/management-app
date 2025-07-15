import { expect, it, faker, db, mockSessionWithTestData, type Mock } from '@/tests/unit.helpers'
import { onCreateAccountAction } from '@/app/account/invitation/[inviteId]/create-account.action'

it('returns ActionFailure when email already exists in Clerk', async () => {
  const { org, client } = await mockSessionWithTestData()

  const inviteId = faker.string.uuid()
  const email = 'duplicate@example.com'

  await db.insertInto('pendingUser').values({
    id: inviteId,
    orgId: org.id,
    email,
    isResearcher: true,
    isReviewer: false,
  }).execute()

  ;(client.users.createUser as Mock).mockImplementation(() => {
    throw { errors: [{ code: 'form_identifier_exists', message: 'identifier exists' }] }
  })

  await expect(
    onCreateAccountAction({
      inviteId,
      form: { firstName: 'a', lastName: 'b', password: 'Abcdef12!', confirmPassword: 'Abcdef12!' },
    }),
  ).rejects.toMatchObject({
    message: expect.stringContaining('already associated'),
  })
})
