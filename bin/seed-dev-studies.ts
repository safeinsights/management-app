/* eslint-disable no-console */
/**
 * DEV-ONLY: fill the local database with studies so the admin pickers have something to
 * offer. The SLA upload cascade (Data Partner > Research Lab > study) reads approved
 * studies with no SLA yet, so on a fresh database every dropdown is empty and looks
 * broken.
 *
 * Studies are spread across every enclave/lab pair except SafeInsights, which is the
 * counterparty to these agreements rather than a party to them.
 *
 * Run inside the container:
 *   docker exec mgmnt-app sh -c 'ALLOW_TESTING_DATA=TRUE pnpm exec tsx bin/seed-dev-studies.ts [countPerPair]'
 */
import { db } from '@/database'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { seedStudyFor } from '../tests/e2e.seed'
import { testingDataAllowed } from './lib/testing-data-gate'

// Enough to see the cascade narrow at each step without burying the table.
const DEFAULT_PER_PAIR = 2

// One in this many is left PENDING-REVIEW, so the SLA picker demonstrably excludes them.
const PENDING_EVERY = 3

const TOPICS = [
    'Highlighting and retention',
    'Assignment pacing',
    'Late submission patterns',
    'Video engagement',
    'Quiz retake behaviour',
    'Reading time distribution',
]

const orgPairs = async () => {
    const orgs = await db
        .selectFrom('org')
        .select(['id', 'slug', 'name', 'type'])
        .where('slug', '!=', CLERK_ADMIN_ORG_SLUG)
        .orderBy('slug')
        .execute()

    const enclaves = orgs.filter((org) => org.type === 'enclave')
    const labs = orgs.filter((org) => org.type === 'lab')

    return enclaves.flatMap((enclave) => labs.map((lab) => ({ enclave, lab })))
}

const main = async () => {
    // These studies are fixtures under real org slugs, and nothing about the script says which
    // database it is pointed at. Same gate the other fixture-writing entry points use.
    if (!testingDataAllowed('seed-dev-studies')) return

    const perPair = Number(process.argv[2] ?? DEFAULT_PER_PAIR)
    if (!Number.isInteger(perPair) || perPair < 1) {
        throw new Error(`countPerPair must be a positive integer, got '${process.argv[2]}'`)
    }

    const pairs = await orgPairs()
    if (!pairs.length) {
        throw new Error("no enclave/lab org pairs found. Did 'pnpm run db:migrate' run its seeds?")
    }

    let created = 0
    for (const { enclave, lab } of pairs) {
        for (let n = 0; n < perPair; n++) {
            const topic = TOPICS[created % TOPICS.length]
            // Titles carry the pair so a seeded study is identifiable in a picker.
            const title = `${topic} (${lab.name} / ${enclave.name} #${n + 1})`
            const status = created % PENDING_EVERY === PENDING_EVERY - 1 ? 'PENDING-REVIEW' : 'APPROVED'

            await seedStudyFor({ title, status, enclaveSlug: enclave.slug, labSlug: lab.slug })
            created++
            console.log(`  ${status.padEnd(14)} ${title}`)
        }
    }

    console.log(`\nSeeded ${created} studies across ${pairs.length} org pairs.`)
    await db.destroy()
}

main().catch(async (error) => {
    console.error(error)
    await db.destroy()
    process.exit(1)
})
