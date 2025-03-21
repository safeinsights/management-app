'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function savePhoneNumberAction({
  userId,
  phoneNumber,
}: {
  userId: string
  phoneNumber: string
}) {
  try {
    const client = await clerkClient()
    const user = await client.users.updateUser(userId, {
      phoneNumbers: [{ phoneNumber }],
    })
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save phone number' }
  }
}

export async function verifyPhoneNumberCodeAction({
  userId,
  phoneNumber,
  code,
}: {
  userId: string
  phoneNumber: string
  code: string
}) {
  try {
    // NOTE: Replace the following with the actual Clerk API call for phone verification.
    // This is a placeholder that assumes such an endpoint exists.
    const client = await clerkClient()
    const user = await client.users.verifyPhoneNumber(userId, { phoneNumber, code })
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message || 'Phone verification failed' }
  }
}
