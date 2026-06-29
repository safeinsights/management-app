#!/usr/bin/env -S pnpm exec tsx
/* eslint-disable no-console */
import 'dotenv/config'

import { createClerkClient } from '@clerk/backend'
import prompts from 'prompts'
import { db } from '@/database'
import { findOrCreateSiUserId, findOrCreateOrgMembership } from '@/server/mutations'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

async function promptForUserDetails(): Promise<{
    email: string
    password: string
    firstName: string
    lastName: string
}> {
    const response = await prompts(
        [
            {
                type: 'text',
                name: 'email',
                message: 'Email address:',
                validate: (value) => (isValidEmail(value) ? true : 'Please enter a valid email address'),
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password (min 8 characters):',
                validate: (value) => (value.length >= 8 ? true : 'Password must be at least 8 characters'),
            },
            {
                type: 'text',
                name: 'firstName',
                message: 'First name:',
                validate: (value) => (value.length > 0 ? true : 'First name is required'),
            },
            {
                type: 'text',
                name: 'lastName',
                message: 'Last name (optional):',
            },
        ],
        {
            onCancel: () => {
                console.log('\n❌ Cancelled')
                process.exit(1)
            },
        },
    )

    return response as { email: string; password: string; firstName: string; lastName: string }
}

async function createAdminUser() {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
        console.error('❌ CLERK_SECRET_KEY is not set')
        process.exit(1)
    }

    console.log('\n🔧 Create SI Staff Admin User')
    console.log('================================\n')

    const clerk = createClerkClient({ secretKey })

    // Get user details via interactive prompts
    const { email, password, firstName, lastName } = await promptForUserDetails()

    // Check if user already exists in Clerk
    console.log(`\n🔍 Checking if user exists...`)
    const existingUsers = await clerk.users.getUserList({ emailAddress: [email] })

    let clerkUserId: string

    if (existingUsers.data.length > 0) {
        const existingUser = existingUsers.data[0]
        console.log(`⚠  User with email ${email} already exists in Clerk (ID: ${existingUser.id})`)

        const { proceed } = await prompts(
            {
                type: 'confirm',
                name: 'proceed',
                message: `Add existing user to ${CLERK_ADMIN_ORG_SLUG} org as admin?`,
                initial: false,
            },
            {
                onCancel: () => {
                    console.log('\n❌ Cancelled')
                    process.exit(1)
                },
            },
        )

        if (!proceed) {
            console.log('❌ Cancelled')
            process.exit(0)
        }

        clerkUserId = existingUser.id
    } else {
        // Create new Clerk user
        console.log(`📝 Creating Clerk user...`)
        try {
            const newUser = await clerk.users.createUser({
                emailAddress: [email],
                password,
                firstName,
                lastName: lastName || undefined,
                skipPasswordChecks: true,
            })
            clerkUserId = newUser.id
            console.log(`✅ Created Clerk user: ${clerkUserId}`)
        } catch (err) {
            console.error('❌ Failed to create Clerk user:', err)
            process.exit(1)
        }
    }

    // Create SI database user
    console.log(`\n📊 Setting up SI database user...`)
    const siUserId = await findOrCreateSiUserId(clerkUserId, {
        firstName,
        lastName: lastName || null,
        email,
    })
    console.log(`✅ SI user ID: ${siUserId}`)

    // Add to safe-insights org as admin
    console.log(`\n🏢 Adding to ${CLERK_ADMIN_ORG_SLUG} organization as admin...`)
    await findOrCreateOrgMembership({
        userId: siUserId,
        slug: CLERK_ADMIN_ORG_SLUG,
        isAdmin: true,
    })
    console.log(`✅ Added to ${CLERK_ADMIN_ORG_SLUG} as admin`)

    console.log('\n✨ SI Staff admin user created successfully!')
    console.log(`   Email: ${email}`)
    console.log(`   SI User ID: ${siUserId}`)
    console.log(`   Clerk User ID: ${clerkUserId}`)

    await db.destroy()
}

createAdminUser().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
