import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'
import { fakeUserId } from './ids'
import type { SampleRefs } from './refs'
import { ORGS } from '../seeds/1743608138837_test_users'

export type PersonKey = 'researcher' | 'reviewer' | 'wanda' | 'ima' | 'barry'

// Mailinator, like the test users: the app mails org members, and an undeliverable address bounces.
export const FAKE_PEOPLE = [
    {
        key: 'wanda',
        id: fakeUserId(1),
        firstName: 'Wanda',
        lastName: 'Variance',
        email: 'si-sample-wanda-dbfyq3@mailinator.com',
        org: 'enclave',
        isAdmin: false,
    },
    {
        key: 'ima',
        id: fakeUserId(2),
        firstName: 'Ima',
        lastName: 'Hypothesis',
        email: 'si-sample-ima-dbfyq3@mailinator.com',
        org: 'lab',
        isAdmin: false,
    },
    {
        key: 'barry',
        id: fakeUserId(3),
        firstName: 'Barry',
        lastName: 'Outlier',
        email: 'si-sample-barry-dbfyq3@mailinator.com',
        org: 'enclave',
        isAdmin: true,
    },
] as const

export const PENDING_INVITES = [
    'si-sample-newbie-grad-dbfyq3@mailinator.com',
    'si-sample-tenure-track-dbfyq3@mailinator.com',
]

export const personIds = (refs: SampleRefs): Record<PersonKey, string> => ({
    researcher: refs.researcherId,
    reviewer: refs.reviewerId,
    wanda: fakeUserId(1),
    ima: fakeUserId(2),
    barry: fakeUserId(3),
})

async function seedFakePeople(db: Kysely<DB>, refs: SampleRefs) {
    await db
        .insertInto('user')
        .values(
            FAKE_PEOPLE.map((p) => ({
                id: p.id,
                clerkId: `sample-clerk-${p.key}`,
                firstName: p.firstName,
                lastName: p.lastName,
                email: p.email,
            })),
        )
        .onConflict((oc) => oc.column('id').doUpdateSet((eb) => ({ email: eb.ref('excluded.email') })))
        .execute()

    for (const person of FAKE_PEOPLE) {
        const orgId = person.org === 'enclave' ? refs.enclave.id : refs.lab.id
        const existing = await db
            .selectFrom('orgUser')
            .select('id')
            .where('userId', '=', person.id)
            .where('orgId', '=', orgId)
            .executeTakeFirst()
        if (!existing) {
            await db.insertInto('orgUser').values({ userId: person.id, orgId, isAdmin: person.isAdmin }).execute()
        }
    }
}

async function seedInvites(db: Kysely<DB>, refs: SampleRefs) {
    for (const email of PENDING_INVITES) {
        const existing = await db
            .selectFrom('pendingUser')
            .select('id')
            .where('email', '=', email)
            .where('orgId', '=', refs.enclave.id)
            .executeTakeFirst()
        if (!existing) {
            await db
                .insertInto('pendingUser')
                .values({ email, orgId: refs.enclave.id, invitedByUserId: fakeUserId(3), isAdmin: false })
                .execute()
        }
    }
}

async function seedResearcherProfile(db: Kysely<DB>, refs: SampleRefs) {
    const inserted = await db
        .insertInto('researcherProfile')
        .values({
            userId: refs.researcherId,
            educationDegree: 'Ph.D.',
            educationFieldOfStudy: 'Educational Psychology',
            educationInstitution: 'University of Somewhere Sunny',
            researchInterests: ['procrastination dynamics', 'highlighter semiotics', 'snack-break econometrics'],
            featuredPublicationsUrls: ['https://example.org/papers/a-neon-inquiry'],
            detailedPublicationsUrl: 'https://example.org/~test-researcher',
        })
        .onConflict((oc) => oc.column('userId').doNothing())
        .returning('userId')
        .executeTakeFirst()
    if (!inserted) return

    await db
        .insertInto('researcherPosition')
        .values([
            {
                userId: refs.researcherId,
                affiliation: 'OpenStax Lab',
                position: 'Associate Professor of Applied Procrastination',
                sortOrder: 0,
            },
            {
                userId: refs.researcherId,
                affiliation: 'Institute for Advanced Snacking',
                position: 'Visiting Fellow',
                sortOrder: 1,
            },
        ])
        .execute()
}

// Only the fixed test orgs: a made-up passing scan on a real org's code env would be false.
async function seedCodeEnvScans(db: Kysely<DB>) {
    const unscanned = await db
        .selectFrom('orgCodeEnv')
        .select('orgCodeEnv.id')
        .where(
            'orgCodeEnv.orgId',
            'in',
            ORGS.map((org) => org.id),
        )
        .where(({ not, exists, selectFrom }) =>
            not(
                exists(
                    selectFrom('codeScan').select('codeScan.id').whereRef('codeScan.codeEnvId', '=', 'orgCodeEnv.id'),
                ),
            ),
        )
        .execute()
    if (!unscanned.length) return

    await db
        .insertInto('codeScan')
        .values(
            unscanned.map(({ id }) => ({
                codeEnvId: id,
                status: 'SCAN-COMPLETE' as const,
                results: 'No vulnerabilities found. The image is suspiciously tidy.',
            })),
        )
        .execute()
}

export async function seedExtras(db: Kysely<DB>, refs: SampleRefs) {
    await seedFakePeople(db, refs)
    await seedInvites(db, refs)
    await seedResearcherProfile(db, refs)
    await seedCodeEnvScans(db)
}
