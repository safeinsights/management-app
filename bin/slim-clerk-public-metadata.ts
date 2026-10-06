#!/usr/bin/env -S pnpm exec tsx
/* eslint-disable no-console */

// One-time removal of `orgs` from each Clerk user's publicMetadata (OTTER-752). The session token
// copies publicMetadata, so every org made every request ~320 bytes larger.
//
// Usage: pnpm clerk:slim-metadata [--apply]   (a dry run, with no writes, unless --apply is given)

import 'dotenv/config'
import { createClerkClient, type ClerkClient, type User } from '@clerk/backend'
import { setTimeout as sleep } from 'node:timers/promises'
import { publicMetadata } from '@/lib/clerk'

const PAGE_SIZE = 100
// Keeps the writes below the Clerk Backend API rate limit.
const WRITE_DELAY_MS = 150

type Totals = { found: number; slimmed: number; skipped: number; failed: number }

const byteSize = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8')

// Returns the byte size of the user's publicMetadata after this run.
async function slimUser(clerk: ClerkClient, user: User, apply: boolean, totals: Totals): Promise<number> {
    const metadata = user.publicMetadata
    const before = byteSize(metadata)
    if (!('orgs' in metadata)) return before

    totals.found++
    const userId = metadata.user?.id
    if (!userId) {
        // marshalSession() repairs this user at their next authenticated request (needsUpdate).
        console.log(`skip ${user.id}: publicMetadata has no user.id`)
        totals.skipped++
        return before
    }

    const slim = publicMetadata({ user: { id: userId } })
    if (!apply) {
        totals.slimmed++
        return byteSize(slim)
    }

    try {
        // updateUser replaces publicMetadata; updateUserMetadata deep-merges and would keep `orgs`.
        await clerk.users.updateUser(user.id, { publicMetadata: slim })
        totals.slimmed++
        return byteSize(slim)
    } catch (error: unknown) {
        console.error(`failed ${user.id}:`, error)
        totals.failed++
        return before
    } finally {
        await sleep(WRITE_DELAY_MS)
    }
}

async function main() {
    const apply = process.argv.includes('--apply')
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set')

    const clerk = createClerkClient({ secretKey })
    const instance = secretKey.startsWith('sk_live_') ? 'production' : 'development'
    console.log(`${apply ? 'APPLY' : 'DRY RUN (no writes)'} on the ${instance} Clerk instance\n`)

    const totals: Totals = { found: 0, slimmed: 0, skipped: 0, failed: 0 }
    let largestBefore = 0
    let largestAfter = 0
    // Skipped pre-v3 users keep their size, so only this value shows whether the run worked.
    let largestAfterWithUserId = 0

    for (let offset = 0; ; offset += PAGE_SIZE) {
        // Oldest first, so sign-ups during the run land at the end and do not shift the offset window.
        const { data } = await clerk.users.getUserList({ limit: PAGE_SIZE, offset, orderBy: '+created_at' })
        for (const user of data) {
            largestBefore = Math.max(largestBefore, byteSize(user.publicMetadata))
            const after = await slimUser(clerk, user, apply, totals)
            largestAfter = Math.max(largestAfter, after)
            if (user.publicMetadata.user?.id) largestAfterWithUserId = Math.max(largestAfterWithUserId, after)
        }
        if (data.length < PAGE_SIZE) break
    }

    console.log(`\nUsers with orgs in publicMetadata: ${totals.found}`)
    console.log(`${apply ? 'Slimmed' : 'Would slim'}: ${totals.slimmed}`)
    console.log(`Skipped (no user.id): ${totals.skipped}`)
    console.log(`Failed: ${totals.failed}`)
    console.log(`Largest publicMetadata: ${largestBefore} bytes before, ${largestAfter} bytes after`)
    console.log(`Largest publicMetadata after, users with user.id: ${largestAfterWithUserId} bytes`)

    if (totals.failed > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
