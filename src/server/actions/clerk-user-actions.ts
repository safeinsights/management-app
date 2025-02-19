'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function createUserAction({
  firstName,
  lastName,
  email,
  password,
  organizationId,
}: {
  firstName: string
  lastName: string
  email: string
  password: string
  organizationId: string
}) {
  const client = await clerkClient()
  const user = await client.users.createUser({
    firstName,
    lastName,
    emailAddress: [email],
    password,
  })

//   try {
//     await clerkClient.organizations.createMembership({
//       organizationId,
//       userId: user.id,
//     })
//   } catch (orgError) {
//     console.error('Failed to add user to organization:', orgError)
//     // Optionally: handle or rollback the created user.
//     throw orgError
//   }

  return user
}
