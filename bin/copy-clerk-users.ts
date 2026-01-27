/* eslint-disable no-console */
import 'dotenv/config'
import { createClerkClient, type ClerkClient } from '@clerk/backend'
import { isTestUser, getProtectedTestEmails } from '@/lib/clerk'
import minimist from 'minimist'

interface Config {
    sourceKey: string
    targetKey: string
    dryRun: boolean
    skipExisting: boolean
    limit?: number
}

interface CopyResult {
    created: number
    skipped: number
    errors: string[]
    userMapping: Map<string, string>
}

function parseArgs(): Config {
    const args = minimist(process.argv.slice(2), {
        string: ['source-key', 'target-key', 'limit'],
        boolean: ['dry-run', 'help', 'skip-existing'],
        alias: {
            s: 'source-key',
            t: 'target-key',
            h: 'help',
        },
        default: {
            'skip-existing': true,
        },
    })

    if (args.help) {
        console.log(`
Clerk User Copy Script

Copies users from a source Clerk application to a target application.

Usage:
  npx tsx bin/copy-clerk-users.ts [options]

Options:
  -s, --source-key <key>      Source Clerk secret key (required)
  -t, --target-key <key>      Target Clerk secret key (required)
      --skip-existing         Skip users that already exist in target (default: true)
      --limit <n>             Only copy first n users (useful for testing)
      --dry-run               Preview changes without applying
  -h, --help                  Show this help message

Example:
  npx tsx bin/copy-clerk-users.ts \\
    --source-key sk_live_xxx \\
    --target-key sk_test_yyy \\
    --dry-run

What Gets Copied:
  - Email addresses (primary marked, but unverified in target)
  - First name, last name, username

What Does NOT Get Copied:
  - Passwords (users must reset or use passwordless auth)
  - Phone numbers
  - External ID
  - Metadata (public, private, unsafe)
  - Verification status (emails are unverified in target)
  - Sessions
  - Organization memberships (use separate script)
  - Profile images

Note: Users in target will need to:
  1. Reset their password, OR
  2. Use passwordless auth (magic link, OAuth, etc.)
`)
        process.exit(0)
    }

    const sourceKey = args['source-key']
    const targetKey = args['target-key']
    const dryRun = args['dry-run'] || false
    const skipExisting = args['skip-existing']
    const limit = args['limit'] ? parseInt(args['limit'], 10) : undefined

    if (!sourceKey || !targetKey) {
        console.error('Error: Missing required arguments')
        console.error('Run with --help for usage information')
        process.exit(1)
    }

    return { sourceKey, targetKey, dryRun, skipExisting, limit }
}

async function validateClerkClient(clerk: ClerkClient, name: string): Promise<boolean> {
    try {
        await clerk.users.getCount()
        return true
    } catch (error) {
        console.error(`Failed to connect to ${name} Clerk application:`, error)
        return false
    }
}

async function getExistingUserEmails(clerk: ClerkClient): Promise<Set<string>> {
    const emails = new Set<string>()
    const pageSize = 100
    let offset = 0
    let hasMore = true

    while (hasMore) {
        const response = await clerk.users.getUserList({
            limit: pageSize,
            offset,
        })

        for (const user of response.data) {
            for (const email of user.emailAddresses) {
                emails.add(email.emailAddress.toLowerCase())
            }
        }

        hasMore = response.data.length === pageSize
        offset += pageSize
    }

    return emails
}

async function copyUsers(sourceClerk: ClerkClient, targetClerk: ClerkClient, config: Config): Promise<CopyResult> {
    const result: CopyResult = {
        created: 0,
        skipped: 0,
        errors: [],
        userMapping: new Map(),
    }

    console.log('\nFetching existing users in target...')
    const existingEmails = config.skipExisting ? await getExistingUserEmails(targetClerk) : new Set<string>()
    console.log(`  Found ${existingEmails.size} existing users in target`)

    const protectedTestEmails = getProtectedTestEmails()
    console.log(`  Skipping test users (except ${protectedTestEmails.size} protected seeded accounts)\n`)

    const pageSize = 100
    let offset = 0
    let hasMore = true
    let totalProcessed = 0

    console.log('Copying users...\n')

    while (hasMore) {
        const response = await sourceClerk.users.getUserList({
            limit: pageSize,
            offset,
            orderBy: 'created_at',
        })

        for (const user of response.data) {
            if (config.limit && totalProcessed >= config.limit) {
                hasMore = false
                break
            }

            totalProcessed++
            const primaryEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress
            const displayName = user.fullName || primaryEmail || user.id

            if (primaryEmail && existingEmails.has(primaryEmail.toLowerCase())) {
                console.log(`  ⏭️  Skipped: ${displayName} (already exists)`)
                result.skipped++
                continue
            }

            // Skip test users (but allow protected seeded test accounts)
            if (isTestUser(user, protectedTestEmails)) {
                console.log(`  ⏭️  Skipped: ${displayName} (test user)`)
                result.skipped++
                continue
            }

            if (config.dryRun) {
                console.log(`  📋 Would create: ${displayName}`)
                result.created++
                continue
            }

            try {
                const createParams: Parameters<typeof targetClerk.users.createUser>[0] = {
                    firstName: user.firstName || undefined,
                    lastName: user.lastName || undefined,
                    username: user.username || undefined,
                    skipPasswordRequirement: true,
                    skipPasswordChecks: true,
                }

                if (user.emailAddresses.length > 0) {
                    createParams.emailAddress = user.emailAddresses.map((e) => e.emailAddress)
                }

                const newUser = await targetClerk.users.createUser(createParams)
                result.userMapping.set(user.id, newUser.id)
                console.log(`  ✅ Created: ${displayName} (${user.id} -> ${newUser.id})`)
                result.created++
            } catch (error) {
                const errorMsg = `Failed to create user ${displayName}: ${error}`
                console.error(`  ❌ ${errorMsg}`)
                result.errors.push(errorMsg)
            }
        }

        hasMore = hasMore && response.data.length === pageSize
        offset += pageSize

        if (hasMore) {
            console.log(`  ... processed ${totalProcessed} users so far`)
        }
    }

    return result
}

async function main() {
    const config = parseArgs()

    console.log('\n========================================')
    console.log('Clerk User Copy Script')
    console.log('========================================')

    if (config.dryRun) {
        console.log('\n⚠️  DRY RUN MODE - No changes will be made')
    }

    const sourceClerk = createClerkClient({ secretKey: config.sourceKey })
    const targetClerk = createClerkClient({ secretKey: config.targetKey })

    console.log('\nValidating Clerk connections...')
    const sourceValid = await validateClerkClient(sourceClerk, 'source')
    if (!sourceValid) {
        console.error('Failed to connect to source Clerk application. Check your source-key.')
        process.exit(1)
    }
    console.log('  ✅ Source: Connected')

    const targetValid = await validateClerkClient(targetClerk, 'target')
    if (!targetValid) {
        console.error('Failed to connect to target Clerk application. Check your target-key.')
        process.exit(1)
    }
    console.log('  ✅ Target: Connected')

    const sourceCount = await sourceClerk.users.getCount()
    const targetCount = await targetClerk.users.getCount()
    console.log(`\n  Source users: ${sourceCount}`)
    console.log(`  Target users: ${targetCount}`)

    if (config.limit) {
        console.log(`\n  Limit: ${config.limit} users`)
    }

    const result = await copyUsers(sourceClerk, targetClerk, config)

    console.log('\n========================================')
    console.log('Summary')
    console.log('========================================')
    console.log(`  Created: ${result.created}`)
    console.log(`  Skipped: ${result.skipped}`)
    console.log(`  Errors:  ${result.errors.length}`)

    if (result.errors.length > 0) {
        console.log('\nErrors encountered:')
        for (const error of result.errors) {
            console.log(`  - ${error}`)
        }
        process.exit(1)
    }

    if (config.dryRun) {
        console.log('\n✅ Dry run complete. No changes were made.')
    } else {
        console.log('\n✅ User copy complete!')
        console.log('\n⚠️  Important: Copied users will need to:')
        console.log('   1. Reset their password, OR')
        console.log('   2. Use passwordless auth (magic link, OAuth, etc.)')
    }
}

main().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
