#!/usr/bin/env npx tsx
/* eslint-disable no-console */
import 'dotenv/config'

import { createClerkClient, type ClerkClient } from '@clerk/backend'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from '@/database'
import { findOrCreateSiUserId, findOrCreateOrgMembership } from '@/server/mutations'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'

type TestUserRole = 'researcher' | 'reviewer' | 'admin'

interface TestUserConfig {
    role: TestUserRole
    email: string | undefined
    password: string | undefined
}

const TEST_USERS: TestUserConfig[] = [
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
const TEST_PHONE_BASE = '+1555555'
const TEST_PHONE_START = 100
const TEST_PHONE_END = 199

function formatTestPhoneNumber(suffix: number): string {
    return `${TEST_PHONE_BASE}0${suffix}`
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readTestSupportFile(file: string): string {
    return fs.readFileSync(path.join(__dirname, '../tests/support', file), 'utf8')
}

async function findAvailableTestPhone(clerk: ClerkClient, userId: string, role: string): Promise<string | null> {
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

async function ensurePublicKey(userId: string) {
    const pubKeyStr = readTestSupportFile('public_key.pem')
    const pubKey = Buffer.from(pemToArrayBuffer(pubKeyStr))
    const fingerprint = readTestSupportFile('public_key.sig').trim()

    const pkey = await db.selectFrom('userPublicKey').where('userId', '=', userId).executeTakeFirst()

    if (!pkey) {
        await db
            .insertInto('userPublicKey')
            .values({ fingerprint, userId, publicKey: pubKey })
            .executeTakeFirstOrThrow()
        console.log(`🔑 Created public key for user`)
    } else {
        console.log(`🔑 Public key already exists`)
    }
}

async function setupOrgMemberships(role: TestUserRole, siUserId: string) {
    switch (role) {
        case 'admin':
            // Admins should be in both enclave and lab orgs
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax',
                isAdmin: true,
            })
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax-lab',
                isAdmin: true,
            })
            console.log(`🏢 Added to openstax (admin) and openstax-lab (admin)`)
            break

        case 'researcher':
            // Researchers go to lab org
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax-lab',
                isAdmin: false,
            })
            console.log(`🏢 Added to openstax-lab (member)`)
            break

        case 'reviewer':
            // Reviewers go to enclave org
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax',
                isAdmin: false,
            })
            // Reviewer is Admin of the special org for testing
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'reviewer-is-org-admin',
                isAdmin: true,
            })
            console.log(`🏢 Added to openstax (member) and reviewer-is-org-admin (admin)`)
            break
    }
}

async function findOrUpdateClerkTestUsers() {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
        console.error('❌ CLERK_SECRET_KEY is not set')
        process.exit(1)
    }

    const clerk = createClerkClient({ secretKey })

    for (const config of TEST_USERS) {
        const { role, email, password } = config

        if (!email) {
            console.log(`⚠️  Skipping ${role}: CLERK_${role.toUpperCase()}_EMAIL not set`)
            continue
        }

        if (!password) {
            console.log(`⚠️  Skipping ${role}: CLERK_${role.toUpperCase()}_PASSWORD not set`)
            continue
        }

        console.log(`\n🔍 Processing ${role} user: ${email}`)

        try {
            // Try to find existing user by email
            const users = await clerk.users.getUserList({ emailAddress: [email] })
            let clerkUserId: string

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
                        console.log(
                            `📱 Found existing test phone: ${existingTestPhone.phoneNumber}, enabling for MFA...`,
                        )
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

                try {
                    const newUser = await clerk.users.createUser({
                        emailAddress: [email],
                        password,
                        firstName,
                        lastName,
                        skipPasswordChecks: true,
                    })
                    clerkUserId = newUser.id
                    console.log(`✅ Created new Clerk user: ${newUser.id} (${firstName} ${lastName})`)

                    // Add MFA phone number for new user
                    await findAvailableTestPhone(clerk, clerkUserId, role)
                } catch (err) {
                    console.error(`❌ Failed to create Clerk user for ${role}:`, err)
                    continue
                }
            }

            // Now set up the SI database user and org memberships
            console.log(`\n📊 Setting up SI database for ${role}...`)

            const firstName = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`
            const siUserId = await findOrCreateSiUserId(clerkUserId, {
                firstName,
                lastName: 'User',
                email,
            })
            console.log(`✅ SI user ID: ${siUserId}`)

            // Set up public key for admin and reviewer (they need it for encryption)
            if (role === 'admin' || role === 'reviewer') {
                await ensurePublicKey(siUserId)
            }

            // Set up org memberships
            await setupOrgMemberships(role, siUserId)
        } catch (err) {
            console.error(`❌ Error processing ${role}:`, err)
        }
    }

    console.log('\n✨ Done!')
}

findOrUpdateClerkTestUsers().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
