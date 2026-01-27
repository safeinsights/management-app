#!/usr/bin/env npx tsx
/* eslint-disable no-console */
import 'dotenv/config'

import { createClerkClient } from '@clerk/backend'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from '@/database'
import { findOrCreateSiUserId, findOrCreateOrgMembership } from '@/server/mutations'
import { pemToArrayBuffer } from 'si-encryption/util/keypair'
import { TEST_USERS, setupClerkTestUser, type TestUserRole } from './lib/clerk-test-users'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readTestSupportFile(file: string): string {
    return fs.readFileSync(path.join(__dirname, '../tests/support', file), 'utf8')
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
        const { role, email } = config

        try {
            // Set up Clerk user (password, MFA phone)
            const result = await setupClerkTestUser(clerk, config)
            if (!result) {
                continue
            }

            const { clerkUserId } = result

            // Now set up the SI database user and org memberships
            console.log(`\n📊 Setting up SI database for ${role}...`)

            const firstName = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`
            const siUserId = await findOrCreateSiUserId(clerkUserId, {
                firstName,
                lastName: 'User',
                email: email!,
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
