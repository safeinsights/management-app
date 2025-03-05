'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function createUserAction({
  firstName,
  lastName,
  email,
  password,
  organizationId, // This parameter is kept for compatibility but ignored
}: {
  firstName: string
  lastName: string
  email: string
  password: string
  organizationId: string
}) {
  try {
    const client = await clerkClient()
    const user = await client.users.createUser({
      firstName,
      lastName,
      emailAddress: [email],
      password,
    })
    
    return user
  } catch (error) {
    console.error('Failed to create user:', error)
    throw new Error('User creation failed')
  }
}
