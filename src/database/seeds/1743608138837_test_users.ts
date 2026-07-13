import type { DB } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { createHash } from 'node:crypto'

// Copy of tests/support/public_key.pem, embedded because the migrator Lambda runs this seed
// without a repo checkout to read the file from. A unit test asserts it stays in sync.
export const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAhwpt565psROI0lzRT1i6
AzuENGyqK9MPnEJ4SZ+nZZeXYYm/PzxV/sovltwyOxgD4A/fAvi5hftcscuWpsYR
yox0wx0wKECZ+4DHy8X4iLGdRh9KCM8pddgKHKXnb8/cLEKmzCR/gXSeMG8TkLIo
LV3IjtkoPRj8GZIJxVqqQ/UVtiqcOj4FXbqBiQdydLER8jPhzQLdmXHoHkerxCRy
8HfzjU1M289bGoqW6IAQ1+AIYCemdsrfWqQZEGOrOTJcaWIcdDnwCatr+TC6blCg
WhhfiNGWRLf2Vhuu6uYRhIilo16wGb6woCCm+VsgL6xa5HLvcF5l6cdyerUmKzrB
LMXXpPaO0sTsAR9/QTL8bjXK2DByKqeVQ53cK+FcKCrC+al3pl7Jj8VuFxcCjs3x
7DKreBR8w6BunILrD/dVEYLslKHNTOVtHvFBjJDdX956OKyo7ZQchnbfWQrZyeor
5c9ERtxPqp9Aq++k9aE5pqQ0u4BjgwsLhL9lzsEcBDBF4D3DEJapTKO0LsZLmn36
Ssf4Huw9x9pCzj5jl8VFRfwY42BH/TYwTd6QtDO7cfelOLG/roX6vLP8+lZB8OUF
Viiiv7pMXLecfrwuZZrfg+08UsF8H1vY9P4bw3dmzhHxwF3inIvYpHDAp7tnSFGp
8lwX7mjUqudVA93y6z1U6hsCAwEAAQ==
-----END PUBLIC KEY-----`

const titleize = (str: string) => str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())

// Fixed UUIDs so that concurrent CI runs sharing the same Clerk instance
// always produce identical publicMetadata and don't stomp on each other.
const ORGS: { slug: string; type: 'enclave' | 'lab'; id: string }[] = [
    { slug: 'safe-insights', type: 'enclave', id: '00000000-0000-4000-8000-000000000101' },
    { slug: 'safe-insights-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000102' },
    { slug: 'openstax', type: 'enclave', id: '00000000-0000-4000-8000-000000000103' },
    { slug: 'openstax-lab', type: 'lab', id: '00000000-0000-4000-8000-000000000104' },
    { slug: 'single-lang-r-enclave', type: 'enclave', id: '00000000-0000-4000-8000-000000000105' },
    { slug: 'reviewer-is-org-admin', type: 'enclave', id: '00000000-0000-4000-8000-000000000106' },
]

type TestUserRole = 'admin' | 'researcher' | 'reviewer'

// Test users are keyed by a unique `key`, not by role, so multiple users can share a role
// (e.g. the persistent QA login accounts alongside the original per-role fixtures). `role`
// drives org memberships (see ORG_MEMBERSHIPS_BY_ROLE); `key` gives each user a distinct
// deterministic clerkId. Fixed UUIDs keep concurrent CI runs sharing a Clerk instance stable.
type TestUser = { key: string; role: TestUserRole; id: string; email: string }

const TEST_USERS: TestUser[] = [
    { key: 'admin', role: 'admin', id: '00000000-0000-4000-8000-000000000001', email: 'si-adm-tester-dbfyq3@mailinator.com' }, // prettier-ignore
    { key: 'researcher', role: 'researcher', id: '00000000-0000-4000-8000-000000000002', email: 'si-research-tester-dbfyq3@mailinator.com' }, // prettier-ignore
    { key: 'reviewer', role: 'reviewer', id: '00000000-0000-4000-8000-000000000003', email: 'si-member-tester-dbfyq3@mailinator.com' }, // prettier-ignore

    // Persistent QA login accounts. These already exist in Clerk; this seed only wires up their
    // SI DB access (user row + memberships + key). The clerkId here is a placeholder — user-sync
    // reconciles the real Clerk id by email on first login (matched via lower(email) below).
    { key: 'qa-admin', role: 'admin', id: '00000000-0000-4000-8000-000000000011', email: 'qa-review+admin@safeinsights.org' }, // prettier-ignore
    { key: 'qa-dp', role: 'reviewer', id: '00000000-0000-4000-8000-000000000012', email: 'qa-review+dp@safeinsights.org' }, // prettier-ignore
    { key: 'qa-researcher', role: 'researcher', id: '00000000-0000-4000-8000-000000000013', email: 'qa-review+researcher@safeinsights.org' }, // prettier-ignore
]

// Role → org memberships. Every user of a role gets the same set, so a new same-role user
// (e.g. qa-dp mirrors reviewer) needs no per-user membership wiring.
const ORG_MEMBERSHIPS_BY_ROLE: Record<TestUserRole, { slug: string; isAdmin: boolean }[]> = {
    admin: [
        { slug: 'safe-insights', isAdmin: true },
        { slug: 'openstax', isAdmin: true },
        { slug: 'openstax-lab', isAdmin: true },
    ],
    researcher: [{ slug: 'openstax-lab', isAdmin: false }],
    reviewer: [
        { slug: 'openstax', isAdmin: false },
        { slug: 'reviewer-is-org-admin', isAdmin: true },
    ],
}

export async function seed(db: Kysely<DB>): Promise<void> {
    if (process.env.NO_TESTING_DATA) return

    // Upsert orgs and capture the actual persisted id for each slug.
    // Existing deployments may already have rows for these slugs with
    // different (random) ids — the onConflict update cannot change the
    // primary key, so we must use whatever id the DB returns when
    // inserting child rows below.
    const orgIdBySlug = new Map<string, string>()

    for (const org of ORGS) {
        const isEnclave = org.type === 'enclave'
        const name =
            org.slug === 'single-lang-r-enclave'
                ? 'Single-Lang R Enclave'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'Reviewer Admin Enclave'
                  : org.type === 'lab'
                    ? `${titleize(org.slug.replace(/-lab$/, ''))} Lab`
                    : titleize(org.slug)

        const email =
            org.slug === 'single-lang-r-enclave'
                ? 'single-lang-r-enclave@example.com'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'reviewer-admin-enclave@example.com'
                  : 'contact@safeinsights.org'

        const description =
            org.slug === 'single-lang-r-enclave'
                ? 'Test-only enclave with R as the single supported language'
                : org.slug === 'reviewer-is-org-admin'
                  ? 'Enclave where the reviewer is an admin'
                  : null

        const settings = isEnclave ? { publicKey: 'BAD KEY, UPDATE ME' } : {}

        const persisted = await db
            .insertInto('org')
            .values({ id: org.id, slug: org.slug, name, email, type: org.type, settings, description })
            .onConflict((oc) =>
                oc.column('slug').doUpdateSet((eb) => ({
                    slug: eb.ref('excluded.slug'),
                    name: eb.ref('excluded.name'),
                })),
            )
            .returning('id')
            .executeTakeFirstOrThrow()

        orgIdBySlug.set(org.slug, persisted.id)
    }

    // Code environments for openstax
    const openstaxId = orgIdBySlug.get('openstax')!
    const existingOpenstaxEnvs = await db.selectFrom('orgCodeEnv').where('orgId', '=', openstaxId).execute()

    if (existingOpenstaxEnvs.length === 0) {
        await db
            .insertInto('orgCodeEnv')
            .values([
                {
                    orgId: openstaxId,
                    name: 'R Code Environment',
                    identifier: 'r-base',
                    language: 'R',
                    url: 'public.ecr.aws/docker/library/r-base:latest',
                    commandLines: { r: 'Rscript main.r' },
                    starterCodeFileNames: ['main.r'],
                    isTesting: false,
                },
                {
                    orgId: openstaxId,
                    name: 'Python Code Environment',
                    identifier: 'python-base',
                    language: 'PYTHON',
                    url: 'public.ecr.aws/docker/library/python:latest',
                    commandLines: { py: 'python main.py' },
                    starterCodeFileNames: ['main.py'],
                    isTesting: false,
                },
            ])
            .execute()
    }

    // Data sources for openstax
    const existingDataSources = await db.selectFrom('orgDataSource').where('orgId', '=', openstaxId).execute()

    if (existingDataSources.length === 0) {
        const codeEnv = await db
            .selectFrom('orgCodeEnv')
            .select('id')
            .where('orgId', '=', openstaxId)
            .executeTakeFirstOrThrow()

        const dataSources = await db
            .insertInto('orgDataSource')
            .values([
                { orgId: openstaxId, name: 'Student Activity Logs' },
                { orgId: openstaxId, name: 'Course Enrollment Data' },
            ])
            .returning('id')
            .execute()

        await db
            .insertInto('orgDataSourceCodeEnv')
            .values(dataSources.map((ds) => ({ dataSourceId: ds.id, codeEnvId: codeEnv.id })))
            .execute()
    }

    // Code environment for single-lang-r-enclave
    const singleLangId = orgIdBySlug.get('single-lang-r-enclave')!
    const existingSingleLangEnvs = await db.selectFrom('orgCodeEnv').where('orgId', '=', singleLangId).execute()

    if (existingSingleLangEnvs.length === 0) {
        await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: singleLangId,
                name: 'R Code Environment (Single-Lang)',
                identifier: 'r-base',
                language: 'R',
                url: 'public.ecr.aws/docker/library/r-base:latest',
                commandLines: { r: 'Rscript main.r' },
                starterCodeFileNames: ['main.r'],
                isTesting: false,
            })
            .execute()
    }

    // Find-or-create test users. Existing deployments may have rows with
    // these emails but different (pre-fixed-UUID) ids — match by id OR by
    // lower(email) so we update in place instead of hitting the unique
    // `user_email_lower_unique` index.
    const userIdByKey = new Map<string, string>()

    for (const user of TEST_USERS) {
        const firstName = `Test ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`

        const existing = await db
            .selectFrom('user')
            .select('id')
            .where((eb) => eb.or([eb('id', '=', user.id), eb(sql`lower(email)`, '=', user.email.toLowerCase())]))
            .executeTakeFirst()

        if (existing) {
            await db
                .updateTable('user')
                .set({ firstName, lastName: 'User', email: user.email })
                .where('id', '=', existing.id)
                .execute()
            userIdByKey.set(user.key, existing.id)
        } else {
            await db
                .insertInto('user')
                .values({
                    id: user.id,
                    clerkId: `test-clerk-${user.key}`,
                    firstName,
                    lastName: 'User',
                    email: user.email,
                })
                .execute()
            userIdByKey.set(user.key, user.id)
        }
    }

    // Org memberships, expanded per user from its role's template.
    for (const user of TEST_USERS) {
        const userId = userIdByKey.get(user.key)!

        for (const membership of ORG_MEMBERSHIPS_BY_ROLE[user.role]) {
            const orgId = orgIdBySlug.get(membership.slug)!

            const existing = await db
                .selectFrom('orgUser')
                .select('id')
                .where('userId', '=', userId)
                .where('orgId', '=', orgId)
                .executeTakeFirst()

            if (existing) {
                await db
                    .updateTable('orgUser')
                    .set({ isAdmin: membership.isAdmin })
                    .where('userId', '=', userId)
                    .where('orgId', '=', orgId)
                    .execute()
            } else {
                await db.insertInto('orgUser').values({ userId, orgId, isAdmin: membership.isAdmin }).execute()
            }
        }
    }

    // Every test user belongs to an org that requires an encryption key (enclave or lab), so the
    // RequireUserKey gate redirects them to key generation until one exists. Seed the shared
    // test public key (tests/support/public_key.pem) — NOT a placeholder — so results encrypted
    // for it by the e2e (bin/debug/upload-results.ts) produce a wrapped key whose fingerprint matches
    // the seeded user, and decrypt with tests/support/private_key.pem.
    // Inlined from si-encryption's pemToArrayBuffer/fingerprintKeyData: importing that package
    // pulls in `debug`, whose CJS require('tty') crashes the esbuild ESM bundle the migrator
    // Lambda runs seeds from. The fingerprint format (hex of SHA-256 over SPKI DER) must stay
    // in sync with si-encryption, verified identical for this key.
    const publicKeyDer = Buffer.from(TEST_PUBLIC_KEY_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
    const fingerprint = createHash('sha256').update(publicKeyDer).digest('hex')

    for (const user of TEST_USERS) {
        const userId = userIdByKey.get(user.key)!

        const existing = await db
            .selectFrom('userPublicKey')
            .select('id')
            .where('userId', '=', userId)
            .executeTakeFirst()
        if (existing) continue

        await db
            .insertInto('userPublicKey')
            .values({
                userId,
                publicKey: publicKeyDer,
                fingerprint,
            })
            .execute()
    }
}
