import type { DB } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { createHash } from 'node:crypto'

// Copy of tests/support/public_key.pem, embedded because the migrator Lambda runs this seed
// without a repo checkout to read the file from. A unit test asserts it stays in sync.
export const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAnkxeGkXRU55i44S5KNoo
1XHRm97qKdKXKt2xK6+SZQgjpUZFOcObWP0jrQxunj63gxOsb+isaYm2C/rl4zAq
smh4BwG3VxgO2jQfwLWHaIMeJUSvaM1fOGLkaSyGWVPA0r4PwAkBZH+QrtW8Az/W
BupPZ9++TdpFy7eitH9dzdViZdZluVDaYcZ6OguF+Ed3IiFudBN1J4yDTAqzXHkr
Ad0lSG5d/k8ONBpHLs6gmaLuPHa/XQIQPxZ/Y6nFS1Dq+KJW8y6bCPPeJfdFVaxF
s7auem3FCKGvzuJeFKa3n+lMAnf3YeazF6nS3hcaTrxrLvsm282LdTFaRXrU60Ur
xXDT0GlBWiCnJwqIXZsWk6ta7zPl70pRNM/zymgJlJsA5w5laapFqGVljClkGrzt
k3HLd54Z5M4CJG+10sVC6mmXJHaqmGU4cdqTC235vmjOZGz8xzitXi3caAnQNKhw
R+A2jpGE+oUAethwMhlo2+6PjXOcKk4ALLbgKZnBLMo8USr168+o3Qvb7MsI+E4f
p8qFdnFg4jKe8JyAafRMUOENG9+LxskQsXVi8jDGIhKf6Ix+ubjr+J4E6CBJcTDG
9RIOYiaKBhLQ4Z3EFynKBYjMA48N9LLREiBb25BX8XKRGoFT5ezP2gQgCzrlAQh6
UdB9nPRag5tVlOVm412S8aUCAwEAAQ==
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
    // ========================= READ BEFORE EDITING =========================
    // This seed writes credentials that are public by design: the private half of the key below
    // is committed at tests/support/private_key.pem so tests can decrypt. It also writes fixed
    // UUIDs and admin memberships on real org slugs. None of it belongs in a deployed database.
    //
    // It ran against production. The previous guard was an opt-OUT on NO_TESTING_DATA, a
    // variable the infrastructure computed from an unresolved CloudFormation token and so never
    // actually set. Two independent opt-IN checks now apply, and both must pass.
    //
    // The real slugs below (safe-insights, openstax, openstax-lab) are deliberate and must stay:
    // safe-insights is the live SI-admin slug (CLERK_ADMIN_ORG_SLUG in src/lib/types.ts, used by
    // src/lib/session.ts) and the openstax slugs drive feature gating (src/lib/constants.ts).
    // The e2e specs hard-code them as URL paths. Safety comes from this gate, not from the names.
    //
    // Keep both checks as inline process.env reads with no new imports: importing anything that
    // pulls in a CJS dependency (@/server/config -> debug -> require('tty')) crashes the esbuild
    // ESM bundle the migrator Lambda runs seeds from. See the note near TEST_PUBLIC_KEY_PEM.
    // =======================================================================

    // Opt in explicitly. Set by local dev, CI, and the non-production migrator Lambdas only.
    if (!process.env.ALLOW_TESTING_DATA) return

    // Independent production backstop, in case something ever sets the opt-in there. NODE_ENV is
    // deliberately not consulted: it is 'production' in every Next production build, including
    // non-production deployed environments.
    const envName = (process.env.ENVIRONMENT_ID || process.env.DEPLOY_ENV || '').toLowerCase()
    if (envName === 'production' || envName === 'prod') return

    // Upsert orgs and capture the actual persisted id for each slug.
    // Existing deployments may already have rows for these slugs with
    // different (random) ids — the onConflict update cannot change the
    // primary key, so we must use whatever id the DB returns when
    // inserting child rows below.
    const orgIdBySlug = new Map<string, string>()

    for (const org of ORGS) {
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

        // Enclaves previously got `publicKey: 'BAD KEY, UPDATE ME'` here. Nothing reads that
        // placeholder, and writing it on a fresh insert would leave a real enclave unable to
        // receive encrypted results, so enclaves now start with empty settings like labs and
        // get a real key through the normal admin flow. Existing rows were never affected:
        // the onConflict below updates only slug and name.
        const settings = {}

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
