#!/usr/bin/env -S pnpm exec tsx
/* eslint-disable no-console */

// One-time removal of `orgs` from each Clerk user's publicMetadata (OTTER-752). The session token
// copies publicMetadata, so every org made every request ~320 bytes larger.
//
// --restore writes the orgs back from the database. While the new code is live, any metadata write
// (sign-up or user sync) can strip orgs again. Run --restore --apply before deploying the old
// code, allow tokens to refresh, then run it again after deploying to repair concurrent writes.
// Restoring large org lists can reintroduce the original 413 error. Requires DATABASE_URL.
//
// Usage: pnpm clerk:slim-metadata [--restore] [--apply]   (a dry run, with no writes, unless --apply is given)
// Repeat --apply and dry-run until both Would slim and Would strip are 0; deletions can shift pages.

import 'dotenv/config'
import { createClerkClient, type ClerkClient, type User } from '@clerk/backend'
import { setTimeout as sleep } from 'node:timers/promises'
import { db } from '@/database'
import { restoreMetadataPlan, slimMetadataPlan, type MetadataPlan } from '@/lib/clerk'
import { sessionUserOrgs } from '@/server/db/session-user'

const PAGE_SIZE = 100
// Keeps the writes below the Clerk Backend API rate limit.
const WRITE_DELAY_MS = 150

type Mode = 'slim' | 'restore'
type Totals = { written: number; legacy: number; unchanged: number; skipped: number; failed: number }

const byteSize = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8')

async function planFor(mode: Mode, user: User): Promise<MetadataPlan> {
    if (mode === 'slim') return slimMetadataPlan(user.publicMetadata)
    const userId = user.publicMetadata.user?.id
    const orgs = userId ? await sessionUserOrgs(userId, user.id) : null
    return restoreMetadataPlan(user.publicMetadata, orgs)
}

// Returns the byte size of the user's publicMetadata after this run.
async function applyPlan(clerk: ClerkClient, user: User, plan: MetadataPlan, apply: boolean, totals: Totals) {
    const before = byteSize(user.publicMetadata)
    if (plan.action === 'keep') {
        totals.unchanged++
        return before
    }
    if (plan.action === 'skip') {
        console.log(`skip ${user.id}: ${plan.reason}`)
        totals.skipped++
        return before
    }

    const after = byteSize(plan.metadata)
    if (plan.legacy) console.log(`no user.id ${user.id}: ${before} bytes before, ${after} bytes after`)
    if (apply) {
        try {
            // updateUser replaces publicMetadata; updateUserMetadata deep-merges and would keep `orgs`.
            // When upgrading to Clerk BAPI 2026-05-12, use replaceUserMetadata (not the merge API).
            await clerk.users.updateUser(user.id, { publicMetadata: plan.metadata })
        } catch (error: unknown) {
            console.error(`failed ${user.id}:`, error)
            totals.failed++
            return before
        } finally {
            await sleep(WRITE_DELAY_MS)
        }
    }
    if (plan.legacy) totals.legacy++
    else totals.written++
    return after
}

function printTotals(mode: Mode, apply: boolean, totals: Totals) {
    if (mode === 'slim') {
        console.log(`\n${apply ? 'Slimmed' : 'Would slim'}: ${totals.written}`)
        console.log(`${apply ? 'Stripped' : 'Would strip'} (no user.id): ${totals.legacy}`)
    } else {
        console.log(`\n${apply ? 'Restored' : 'Would restore'}: ${totals.written}`)
    }
    console.log(`Unchanged: ${totals.unchanged}`)
    console.log(`Skipped: ${totals.skipped}`)
    console.log(`Failed: ${totals.failed}`)
}

async function main() {
    const apply = process.argv.includes('--apply')
    const mode: Mode = process.argv.includes('--restore') ? 'restore' : 'slim'
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set')

    const clerk = createClerkClient({ secretKey })
    const instance = secretKey.startsWith('sk_live_') ? 'production' : 'development'
    console.log(`${apply ? 'APPLY' : 'DRY RUN (no writes)'}: ${mode} on the ${instance} Clerk instance\n`)

    const totals: Totals = { written: 0, legacy: 0, unchanged: 0, skipped: 0, failed: 0 }
    let largestBefore = 0
    let largestAfter = 0

    for (let offset = 0; ; offset += PAGE_SIZE) {
        // Oldest first, so sign-ups during the run land at the end and do not shift the offset window.
        const { data } = await clerk.users.getUserList({ limit: PAGE_SIZE, offset, orderBy: '+created_at' })
        for (const user of data) {
            largestBefore = Math.max(largestBefore, byteSize(user.publicMetadata))
            const plan = await planFor(mode, user)
            largestAfter = Math.max(largestAfter, await applyPlan(clerk, user, plan, apply, totals))
        }
        if (data.length < PAGE_SIZE) break
    }

    printTotals(mode, apply, totals)
    if (mode === 'slim')
        console.log(
            'Repeat apply and dry-run until Would slim and Would strip are both 0; concurrent deletions can shift pages.',
        )
    console.log(`Largest publicMetadata: ${largestBefore} bytes before, ${largestAfter} bytes after`)

    if (totals.failed > 0) process.exitCode = 1
}

main()
    .catch((error: unknown) => {
        console.error('Fatal error:', error)
        process.exitCode = 1
    })
    .finally(() => db.destroy())
