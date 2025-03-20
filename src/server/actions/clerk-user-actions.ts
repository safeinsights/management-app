'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function createClerkUserAction({
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

        const client = await clerkClient()

        // Create the user without associating with organization
        const user = await client.users.createUser({
            firstName,
            lastName,
            emailAddress: [email],
            password,
        })

        return { success: true, message: 'User created successfully', clerkId: user.id }
    } catch (error: unknown) {
        // Extract more specific error information if available
        let errorMessage = 'Unknown error during user creation'
        
        if (error && typeof error === 'object') {
            if ('errors' in error) {
                errorMessage = JSON.stringify((error as { errors: unknown }).errors)
            } else if ('message' in error) {
                errorMessage = (error as { message: string }).message
            }
        }

        // Re-throw with more context
        throw new Error(`User creation failed: ${errorMessage}`)
    }
}
