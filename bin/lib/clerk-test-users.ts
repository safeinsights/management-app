/* eslint-disable no-console */
import { type ClerkClient } from '@clerk/backend'

export type TestUserRole = 'researcher' | 'reviewer' | 'admin'

export interface TestUserConfig {
    role: TestUserRole
    email: string | undefined
    password: string | undefined
}

export const TEST_USERS: TestUserConfig[] = [
    {
        role: 'researcher',
        email: process.env.CLERK_RESEARCHER_EMAIL,
        password: process.env.CLERK_RESEARCHER_PASSWORD,
    },
    {
        role: 'reviewer',
        email: process.env.CLERK_REVIEWER_EMAIL,
        password: process.env.CLERK_REVIEWER_PASSWORD,
    },
    {
        role: 'admin',
        email: process.env.CLERK_ADMIN_EMAIL,
        password: process.env.CLERK_ADMIN_PASSWORD,
    },
]

// Test phone numbers range from +1 (XXX) 555-0100 to +1 (XXX) 555-0199
// Using area code 555 for fictional numbers
// Verification code for test phones is always 424242
export const TEST_PHONE_BASE = '+1555555'
const TEST_PHONE_START = 100
const TEST_PHONE_END = 199

export function formatTestPhoneNumber(suffix: number): string {
    return `${TEST_PHONE_BASE}0${suffix}`
}

export async function findAvailableTestPhone(clerk: ClerkClient, userId: string, role: string): Promise<string | null> {
    for (let suffix = TEST_PHONE_START; suffix <= TEST_PHONE_END; suffix++) {
        const phoneNumber = formatTestPhoneNumber(suffix)
        try {
            await clerk.phoneNumbers.createPhoneNumber({
                userId,
                phoneNumber,
                verified: true,
                reservedForSecondFactor: true,
            })
            console.log(`📱 Added MFA phone for ${role}: ${phoneNumber} (verify code: 424242)`)
            return phoneNumber
        } catch (err: unknown) {
            const error = err as { errors?: Array<{ code?: string }> }
            // Check if error is due to phone number already taken
            const isTaken = error.errors?.some(
                (e) => e.code === 'form_identifier_exists' || e.code === 'form_phone_number_exists',
            )
            if (isTaken) {
                // Try next number
                continue
            }
            // Check if user already has this phone
            const alreadyHas = error.errors?.some((e) => e.code === 'form_identifier_already_claimed')
            if (alreadyHas) {
                console.log(`📱 User already has MFA phone configured`)
                return null
            }
            // Some other error, log and continue trying
            console.log(`⚠️  Phone ${phoneNumber} unavailable, trying next...`)
        }
    }
    console.error(`❌ Could not find available test phone number for ${role}`)
    return null
}

export interface SetupClerkUserResult {
    clerkUserId: string
    created: boolean
}

export async function setupClerkTestUser(
    clerk: ClerkClient,
    config: TestUserConfig,
): Promise<SetupClerkUserResult | null> {
    const { role, email, password } = config

    if (!email) {
        console.log(`⚠️  Skipping ${role}: CLERK_${role.toUpperCase()}_EMAIL not set`)
        return null
    }

    if (!password) {
        console.log(`⚠️  Skipping ${role}: CLERK_${role.toUpperCase()}_PASSWORD not set`)
        return null
    }

    console.log(`\n🔍 Processing ${role} user: ${email}`)

    // Try to find existing user by email
    const users = await clerk.users.getUserList({ emailAddress: [email] })
    let clerkUserId: string
    let created = false

    if (users.data.length > 0) {
        const user = users.data[0]
        clerkUserId = user.id
        console.log(`✅ Found existing Clerk user: ${user.id} (${user.firstName} ${user.lastName})`)

        // Update password if user exists
        try {
            await clerk.users.updateUser(user.id, { password })
            console.log(`🔑 Updated password for ${role}`)
        } catch (err) {
            console.error(`⚠️  Failed to update password for ${role}:`, err)
        }

        // Check if user already has a phone for MFA
        const mfaPhone = user.phoneNumbers.find((p) => p.reservedForSecondFactor)
        if (mfaPhone) {
            console.log(`📱 Already has MFA phone: ${mfaPhone.phoneNumber}`)
            console.log(`   - Verified: ${mfaPhone.verification?.status === 'verified'}`)
            console.log(`   - Reserved for 2FA: ${mfaPhone.reservedForSecondFactor}`)

            // Ensure the phone is properly configured
            if (mfaPhone.verification?.status !== 'verified') {
                console.log(`⚠️  Phone not verified, updating...`)
                await clerk.phoneNumbers.updatePhoneNumber(mfaPhone.id, {
                    verified: true,
                    reservedForSecondFactor: true,
                })
                console.log(`✅ Phone updated and verified`)
            }
        } else {
            // Check for any existing test phone that might not be configured for MFA
            const existingTestPhone = user.phoneNumbers.find((p) => p.phoneNumber.startsWith(TEST_PHONE_BASE))
            if (existingTestPhone) {
                console.log(`📱 Found existing test phone: ${existingTestPhone.phoneNumber}, enabling for MFA...`)
                await clerk.phoneNumbers.updatePhoneNumber(existingTestPhone.id, {
                    verified: true,
                    reservedForSecondFactor: true,
                })
                console.log(`✅ Phone configured for MFA`)
            } else {
                // Add MFA phone number
                await findAvailableTestPhone(clerk, clerkUserId, role)
            }
        }
    } else {
        // Create new user
        console.log(`📝 Creating new Clerk user for ${role}...`)

        const firstName = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`
        const lastName = 'User'

        const newUser = await clerk.users.createUser({
            emailAddress: [email],
            password,
            firstName,
            lastName,
            skipPasswordChecks: true,
        })
        clerkUserId = newUser.id
        created = true
        console.log(`✅ Created new Clerk user: ${newUser.id} (${firstName} ${lastName})`)

        // Add MFA phone number for new user
        await findAvailableTestPhone(clerk, clerkUserId, role)
    }

    return { clerkUserId, created }
}
