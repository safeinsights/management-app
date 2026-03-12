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
import type { UserInfo } from '@/lib/types'

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
            const isTaken = error.errors?.some(
                (e) => e.code === 'form_identifier_exists' || e.code === 'form_phone_number_exists',
            )
            if (isTaken) {
                continue
            }
            const alreadyHas = error.errors?.some((e) => e.code === 'form_identifier_already_claimed')
            if (alreadyHas) {
                console.log(`📱 User already has MFA phone configured`)
                return null
            }
            console.log(`⚠️  Phone ${phoneNumber} unavailable, trying next...`)
        }
    }
    console.error(`❌ Could not find available test phone number for ${role}`)
    return null
}

async function setupClerkUser(clerk: ClerkClient, config: TestUserConfig): Promise<string | null> {
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

    const users = await clerk.users.getUserList({ emailAddress: [email] })
    let clerkUserId: string

    if (users.data.length > 0) {
        const user = users.data[0]
        clerkUserId = user.id
        console.log(`✅ Found existing Clerk user: ${user.id} (${user.firstName} ${user.lastName})`)

        try {
            await clerk.users.updateUser(user.id, { password })
            console.log(`🔑 Updated password for ${role}`)
        } catch (err) {
            console.error(`⚠️  Failed to update password for ${role}:`, err)
        }

        const mfaPhone = user.phoneNumbers.find((p) => p.reservedForSecondFactor)
        if (mfaPhone) {
            console.log(`📱 Already has MFA phone: ${mfaPhone.phoneNumber}`)
            console.log(`   - Verified: ${mfaPhone.verification?.status === 'verified'}`)
            console.log(`   - Reserved for 2FA: ${mfaPhone.reservedForSecondFactor}`)

            if (mfaPhone.verification?.status !== 'verified') {
                console.log(`⚠️  Phone not verified, updating...`)
                await clerk.phoneNumbers.updatePhoneNumber(mfaPhone.id, {
                    verified: true,
                    reservedForSecondFactor: true,
                })
                console.log(`✅ Phone updated and verified`)
            }
        } else {
            const existingTestPhone = user.phoneNumbers.find((p) => p.phoneNumber.startsWith(TEST_PHONE_BASE))
            if (existingTestPhone) {
                console.log(`📱 Found existing test phone: ${existingTestPhone.phoneNumber}, enabling for MFA...`)
                await clerk.phoneNumbers.updatePhoneNumber(existingTestPhone.id, {
                    verified: true,
                    reservedForSecondFactor: true,
                })
                console.log(`✅ Phone configured for MFA`)
            } else {
                await findAvailableTestPhone(clerk, clerkUserId, role)
            }
        }
    } else {
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

            const primaryEmail = newUser.emailAddresses.find((e) => e.emailAddress === email)
            if (primaryEmail) {
                await clerk.emailAddresses.updateEmailAddress(primaryEmail.id, { verified: true })
                console.log(`✅ Email verified`)
            }

            await findAvailableTestPhone(clerk, clerkUserId, role)
        } catch (err) {
            console.error(`❌ Failed to create Clerk user for ${role}:`, err)
            return null
        }
    }

    return clerkUserId
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

async function updateClerkPublicMetadata(clerk: ClerkClient, clerkUserId: string, siUserId: string) {
    const orgs = await db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.id', 'org.slug', 'org.type', 'isAdmin'])
        .where('userId', '=', siUserId)
        .execute()

    const metadata: UserInfo = {
        format: 'v3',
        user: { id: siUserId },
        teams: null,
        orgs: orgs.reduce(
            (acc, org) => {
                acc[org.slug] = {
                    ...org,
                    isAdmin: org.isAdmin || false,
                }
                return acc
            },
            {} as UserInfo['orgs'],
        ),
    }

    await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: metadata,
    })
    console.log(`📝 Updated Clerk publicMetadata with ${orgs.length} org(s)`)
}

async function setupOrgMemberships(role: TestUserRole, siUserId: string) {
    switch (role) {
        case 'admin':
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
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax-lab',
                isAdmin: false,
            })
            console.log(`🏢 Added to openstax-lab (member)`)
            break

        case 'reviewer':
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'openstax',
                isAdmin: false,
            })
            await findOrCreateOrgMembership({
                userId: siUserId,
                slug: 'reviewer-is-org-admin',
                isAdmin: true,
            })
            console.log(`🏢 Added to openstax (member) and reviewer-is-org-admin (admin)`)
            break
    }
}

async function setupSiUser(clerk: ClerkClient, clerkUserId: string, config: TestUserConfig): Promise<string> {
    const { role, email } = config
    const firstName = `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`

    console.log(`\n📊 Setting up SI database for ${role}...`)

    const siUserId = await findOrCreateSiUserId(clerkUserId, {
        firstName,
        lastName: 'User',
        email,
    })
    console.log(`✅ SI user ID: ${siUserId}`)

    if (role === 'admin' || role === 'reviewer') {
        await ensurePublicKey(siUserId)
    }

    await setupOrgMemberships(role, siUserId)
    await updateClerkPublicMetadata(clerk, clerkUserId, siUserId)

    return siUserId
}

async function setupOrganizations() {
    console.log('\n🏗️  Setting up organizations and code environments...')

    const pubKeyStr = readTestSupportFile('public_key.pem')

    const org = await db
        .selectFrom('org')
        .select(['id', 'settings', 'type'])
        .where('slug', '=', 'openstax')
        .executeTakeFirst()

    if (!org) {
        console.log(`⚠️  Org 'openstax' not found - skipping org setup (run database seed first)`)
        return
    }

    if (org.type === 'enclave') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settings = org.settings as any
        if (!settings.publicKey || settings.publicKey.length < 1000) {
            await db
                .updateTable('org')
                .set({ settings: { ...settings, publicKey: pubKeyStr } })
                .where('id', '=', org.id)
                .execute()
            console.log(`🔐 Updated publicKey in openstax settings`)
        } else {
            console.log(`🔐 openstax already has publicKey configured`)
        }

        const existingImages = await db.selectFrom('orgCodeEnv').where('orgId', '=', org.id).execute()
        if (existingImages.length === 0) {
            await db
                .insertInto('orgCodeEnv')
                .values([
                    {
                        orgId: org.id,
                        name: 'R Code Environment',
                        identifier: 'r-base',
                        language: 'R',
                        url: 'public.ecr.aws/docker/library/r-base:latest',
                        cmdLine: 'Rscript main.r',
                        starterCodePath: 'main.r',
                        isTesting: false,
                    },
                    {
                        orgId: org.id,
                        name: 'Python Code Environment',
                        identifier: 'python-base',
                        language: 'PYTHON',
                        url: 'public.ecr.aws/docker/library/python:latest',
                        cmdLine: 'python main.py',
                        starterCodePath: 'main.py',
                        isTesting: false,
                    },
                ])
                .execute()
            console.log(`📦 Created code environments for openstax`)
        } else {
            console.log(`📦 Code environments already exist for openstax`)
        }

        const existingDataSources = await db.selectFrom('orgDataSource').where('orgId', '=', org.id).execute()
        if (existingDataSources.length === 0) {
            const codeEnv = await db
                .selectFrom('orgCodeEnv')
                .select('id')
                .where('orgId', '=', org.id)
                .executeTakeFirstOrThrow()
            await db
                .insertInto('orgDataSource')
                .values([
                    { orgId: org.id, codeEnvId: codeEnv.id, name: 'Student Activity Logs' },
                    { orgId: org.id, codeEnvId: codeEnv.id, name: 'Course Enrollment Data' },
                ])
                .execute()
            console.log(`📊 Created data sources for openstax`)
        } else {
            console.log(`📊 Data sources already exist for openstax`)
        }
    }

    let singleLangOrg = await db
        .selectFrom('org')
        .selectAll('org')
        .where('slug', '=', 'single-lang-r-enclave')
        .executeTakeFirst()

    if (!singleLangOrg) {
        singleLangOrg = await db
            .insertInto('org')
            .values({
                slug: 'single-lang-r-enclave',
                name: 'Single-Lang R Enclave',
                type: 'enclave',
                email: 'single-lang-r-enclave@example.com',
                description: 'Test-only enclave with R as the single supported language',
                settings: { publicKey: pubKeyStr },
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        console.log(`🏢 Created single-lang-r-enclave org`)
    } else {
        console.log(`🏢 single-lang-r-enclave org already exists`)
    }

    const existingSingleLangImages = await db.selectFrom('orgCodeEnv').where('orgId', '=', singleLangOrg.id).execute()

    if (existingSingleLangImages.length === 0) {
        await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: singleLangOrg.id,
                name: 'R Code Environment (Single-Lang)',
                identifier: 'r-base',
                language: 'R',
                url: 'public.ecr.aws/docker/library/r-base:latest',
                cmdLine: 'Rscript main.r',
                starterCodePath: 'main.r',
                isTesting: false,
            })
            .execute()
        console.log(`📦 Created code environment for single-lang-r-enclave`)
    } else {
        console.log(`📦 Code environment already exists for single-lang-r-enclave`)
    }

    let reviewerAdminOrg = await db
        .selectFrom('org')
        .selectAll('org')
        .where('slug', '=', 'reviewer-is-org-admin')
        .executeTakeFirst()

    if (!reviewerAdminOrg) {
        reviewerAdminOrg = await db
            .insertInto('org')
            .values({
                slug: 'reviewer-is-org-admin',
                name: 'Reviewer Admin Enclave',
                type: 'enclave',
                email: 'reviewer-admin-enclave@example.com',
                description: 'Enclave where the reviewer is an admin',
                settings: { publicKey: pubKeyStr },
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        console.log(`🏢 Created reviewer-is-org-admin org`)
    } else {
        console.log(`🏢 reviewer-is-org-admin org already exists`)
    }
}

async function seedEnvironment() {
    console.log('🌱 Seeding test environment...\n')

    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
        console.error('❌ CLERK_SECRET_KEY is not set')
        process.exit(1)
    }

    const clerk = createClerkClient({ secretKey })

    await setupOrganizations()

    for (const config of TEST_USERS) {
        try {
            const clerkUserId = await setupClerkUser(clerk, config)
            if (!clerkUserId) continue

            await setupSiUser(clerk, clerkUserId, config)
        } catch (err) {
            console.error(`❌ Error processing ${config.role}:`, err)
        }
    }

    console.log('\n✨ Environment seeding complete!')
}

seedEnvironment().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
