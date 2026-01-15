#!/usr/bin/env npx tsx
/* eslint-disable no-console */
import 'dotenv/config'

import { createClerkClient } from '@clerk/backend'
import minimist from 'minimist'
import { TEST_USERS, setupClerkTestUser } from './lib/clerk-test-users'

interface Config {
    secretKey: string
}

function parseArgs(): Config {
    const args = minimist(process.argv.slice(2), {
        string: ['secret-key'],
        boolean: ['help'],
        alias: {
            s: 'secret-key',
            h: 'help',
        },
    })

    if (args.help) {
        console.log(`
Clerk Test User Setup Script

Sets up test users in Clerk only (no database changes):
  - Creates users if they do not exist
  - Sets/updates passwords
  - Configures MFA phone numbers

Usage:
  npx tsx bin/setup-clerk-test-users.ts [options]

Options:
  -s, --secret-key <key>    Clerk secret key (defaults to CLERK_SECRET_KEY env var)
  -h, --help                Show this help message

Example:
  npx tsx bin/setup-clerk-test-users.ts
  npx tsx bin/setup-clerk-test-users.ts --secret-key sk_live_xxx

Note: Test user emails and passwords are read from environment variables:
  CLERK_RESEARCHER_EMAIL, CLERK_RESEARCHER_PASSWORD
  CLERK_REVIEWER_EMAIL, CLERK_REVIEWER_PASSWORD
  CLERK_ADMIN_EMAIL, CLERK_ADMIN_PASSWORD
`)
        process.exit(0)
    }

    const secretKey = args['secret-key'] || process.env.CLERK_SECRET_KEY

    if (!secretKey) {
        console.error('Error: Missing Clerk secret key')
        console.error('Provide --secret-key or set CLERK_SECRET_KEY env var')
        console.error('Run with --help for usage information')
        process.exit(1)
    }

    return { secretKey }
}

async function setupClerkTestUsers() {
    const config = parseArgs()

    console.log('\n========================================')
    console.log('Clerk Test User Setup Script')
    console.log('========================================')
    console.log('\nThis script sets up test users in Clerk only:')
    console.log('  - Creates users if they do not exist')
    console.log('  - Sets/updates passwords')
    console.log('  - Configures MFA phone numbers')
    console.log('\nFor full setup including database, use find-or-update-clerk-test-users.ts')

    const clerk = createClerkClient({ secretKey: config.secretKey })

    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (const config of TEST_USERS) {
        try {
            const result = await setupClerkTestUser(clerk, config)
            if (result) {
                successCount++
            } else {
                skipCount++
            }
        } catch (err) {
            console.error(`❌ Error processing ${config.role}:`, err)
            errorCount++
        }
    }

    console.log('\n========================================')
    console.log('Summary')
    console.log('========================================')
    console.log(`  Success: ${successCount}`)
    console.log(`  Skipped: ${skipCount}`)
    console.log(`  Errors:  ${errorCount}`)
    console.log('\n✨ Done!')

    if (errorCount > 0) {
        process.exit(1)
    }
}

setupClerkTestUsers().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
