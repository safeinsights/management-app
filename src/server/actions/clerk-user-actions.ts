'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function createUserAction({
  firstName,
  lastName,
  email,
  password,
}: {
  firstName: string
  lastName: string
  email: string
  password: string
}) {
  try {
    // Basic validation before attempting to create the user
    if (!firstName || !lastName || !email || !password) {
      throw new Error('Missing required user information')
    }

    console.log('Creating user with:', { firstName, lastName, email, passwordLength: password.length })
    
    const client = await clerkClient()
    
    // Create the user without associating with organization
    const user = await client.users.createUser({
      firstName,
      lastName,
      emailAddress: [email],
      password,
      phoneNumber: ['+12345550100'],
    })
    
    console.log('User created successfully with ID:', user.id)
    return { success: true, message: 'User created successfully' }
  } catch (error: any) {
    // Log the detailed error information
    console.error('Failed to create user:', error)
    
    // Extract more specific error information if available
    const errorMessage = error.errors 
      ? JSON.stringify(error.errors) 
      : error.message || 'Unknown error during user creation'
    
    console.error('Error details:', errorMessage)
    
    // Re-throw with more context
    throw new Error(`User creation failed: ${errorMessage}`)
  }
}
