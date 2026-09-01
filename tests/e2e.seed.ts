// Playwright and the app share one Postgres, so inserting rows here puts the app into a given
// study/job state without driving the browser. Everything targets the fixed identities
// `db:migrate` creates, so the app authorises the same role the tests sign in as.

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { v7 as uuidv7 } from 'uuid'
import { db, sql } from '@/database'
import type { Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import { findOrCreateLegalDocument } from '@/server/db/legal-document'
import { getS3Client, s3BucketName, withS3Prefix } from '@/server/aws'

// Matches the split a UI-created study produces (submittedByOrgId = lab, orgId = enclave).
const ENCLAVE_SLUG = 'openstax'
const LAB_SLUG = 'openstax-lab'

// Fallback only: in PR environments a user who logged in before seeding owns their email under
// a random UUID.
const FIXED_USER_IDS = {
    admin: '00000000-0000-4000-8000-000000000001',
    researcher: '00000000-0000-4000-8000-000000000002',
    reviewer: '00000000-0000-4000-8000-000000000003',
    legal: '00000000-0000-4000-8000-000000000004',
} as const

type SeedRole = keyof typeof FIXED_USER_IDS

const ROLE_EMAIL_ENV: Record<SeedRole, string> = {
    admin: 'CLERK_ADMIN_EMAIL',
    researcher: 'CLERK_RESEARCHER_EMAIL',
    reviewer: 'CLERK_REVIEWER_EMAIL',
    // Faked-auth only, never provisioned in Clerk, so this env var never resolves and the
    // fixed seed id wins.
    legal: 'CLERK_LEGAL_EMAIL',
}

const userIdCache = new Map<SeedRole, string>()

export async function resolveUserId(role: SeedRole): Promise<string> {
    const cached = userIdCache.get(role)
    if (cached) return cached

    const email = process.env[ROLE_EMAIL_ENV[role]]
    const fixedId = FIXED_USER_IDS[role]

    const row = await db
        .selectFrom('user')
        .select('id')
        .where((eb) =>
            email
                ? eb.or([eb('id', '=', fixedId), eb(sql<string>`lower(email)`, '=', email.toLowerCase())])
                : eb('id', '=', fixedId),
        )
        // Prefer the fixed-id row when both exist so repeated runs are stable.
        .orderBy(sql`case when id = ${fixedId} then 0 else 1 end`)
        .executeTakeFirst()

    if (!row) {
        throw new Error(
            `e2e.seed: no '${role}' user found (looked for id ${fixedId}` +
                (email ? ` or email ${email}` : '') +
                `). Did 'pnpm run db:migrate' run its seeds?`,
        )
    }
    userIdCache.set(role, row.id)
    return row.id
}

// These columns are jsonb holding a Lexical editor state, not plain text.
function lexical(text: string) {
    return {
        root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: null,
            children: [
                {
                    type: 'paragraph',
                    format: '',
                    indent: 0,
                    version: 1,
                    direction: null,
                    textStyle: '',
                    textFormat: 0,
                    children: [{ mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 }],
                },
            ],
        },
    }
}

type SeededOrg = { id: string; slug: string; type: 'enclave' | 'lab' }
const orgCache = new Map<string, SeededOrg>()

async function resolveOrg(slug: string): Promise<SeededOrg> {
    const cached = orgCache.get(slug)
    if (cached) return cached

    const org = await db.selectFrom('org').select(['id', 'slug', 'type']).where('slug', '=', slug).executeTakeFirst()
    if (!org) {
        throw new Error(`e2e.seed: org '${slug}' not found. Did 'pnpm run db:migrate' run its seeds?`)
    }
    orgCache.set(slug, org)
    return org
}

type StudyOverrides = {
    title: string
    status?: StudyStatus
    language?: Language
    datasets?: string[] | null
    submittedAt?: Date | null
    approvedAt?: Date | null
    rejectedAt?: Date | null
    // Inert since OTTER-727 hid the agreements gate; kept so seeded rows stay realistic.
    agreementsAcked?: boolean
    // Only local dev seeding overrides these, to spread studies across org pairs so pickers
    // have something to narrow.
    enclaveSlug?: string
    labSlug?: string
}

async function insertStudy(overrides: StudyOverrides) {
    const [enclave, lab, researcherId, reviewerId] = await Promise.all([
        resolveOrg(overrides.enclaveSlug ?? ENCLAVE_SLUG),
        resolveOrg(overrides.labSlug ?? LAB_SLUG),
        resolveUserId('researcher'),
        resolveUserId('reviewer'),
    ])

    const status = overrides.status ?? 'PENDING-REVIEW'
    const acked = overrides.agreementsAcked ? new Date() : null

    const study = await db
        .insertInto('study')
        .values({
            orgId: enclave.id,
            submittedByOrgId: lab.id,
            researcherId,
            reviewerId: status === 'PENDING-REVIEW' || status === 'DRAFT' ? null : reviewerId,
            containerLocation: 'test-container',
            title: overrides.title,
            piName: 'E2E Test PI',
            // Without this the edit-and-resubmit form is invalid and its submit button stays disabled.
            piUserId: researcherId,
            status,
            language: overrides.language ?? 'R',
            dataSources: ['all'],
            // The proposal form requires at least one dataset to stay valid when pre-filled.
            datasets: overrides.datasets ?? ['Student Activity Logs'],
            outputMimeType: 'application/zip',
            submittedAt: overrides.submittedAt === undefined ? new Date() : overrides.submittedAt,
            approvedAt: overrides.approvedAt ?? null,
            rejectedAt: overrides.rejectedAt ?? null,
            researcherAgreementsAckedAt: acked,
            reviewerAgreementsAckedAt: acked,
            researchQuestions: lexical('What is the impact of highlighting on student outcomes?'),
            projectSummary: lexical('We analyze archival data to study highlighting behavior.'),
            impact: lexical('This research will improve understanding of study habits.'),
        })
        .returning(['id', 'orgId', 'submittedByOrgId', 'researcherId'])
        .executeTakeFirstOrThrow()

    return { study, enclave, lab, researcherId, reviewerId }
}

// In prod a deferred background task writes this; without a seeded row the reviewer screen is
// stuck on "AI Summary is loading".
function buildReviewReport() {
    return {
        proposalSummary: 'Seeded proposal summary for e2e.',
        codeExplanation: 'Seeded AI summary: the code reads the dataset and aggregates results.',
        resultsSummary: 'Seeded results summary.',
        alignmentCheck: { isAligned: true, findings: [] },
        complianceCheck: { isCompliant: true, findings: [] },
    }
}

// `statuses` are inserted oldest-first; the newest is what `latestJobForStudy` resolves.
async function insertSubmittedJob(
    studyId: string,
    statuses: StudyJobStatus[],
    { withMainCode = true, withReview = true }: { withMainCode?: boolean; withReview?: boolean } = {},
) {
    const userId = await resolveUserId('researcher')
    const job = await db.insertInto('studyJob').values({ studyId }).returning('id').executeTakeFirstOrThrow()

    if (withMainCode) {
        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'main.r',
                path: `studies/${studyId}/${job.id}/main.r`,
                fileType: 'MAIN-CODE',
            })
            .execute()
    }

    if (withReview) {
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: sql`${JSON.stringify(buildReviewReport())}::jsonb` })
            .execute()
    }

    // Backdated so a status a later step appends at server-now sorts after the seeded ones.
    const now = Date.now()
    await db
        .insertInto('jobStatusChange')
        .values(
            statuses.map((status, i) => ({
                studyJobId: job.id,
                status,
                userId,
                createdAt: new Date(now - (statuses.length - i) * 1000),
            })),
        )
        .execute()

    return job
}

// Pass a unique title (`studyFeatures.uniqueTitle(...)`) so studies stay isolated per worker.

export type SeedResult = { studyId: string; jobId?: string }

export async function seedProposalPendingReview(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'PENDING-REVIEW' })
    return { studyId: study.id }
}

export async function seedApprovedNoCode(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date() })
    return { studyId: study.id }
}

// Study-scoped, unlike the Terms of Service, so publishing one inside a spec cannot reach another
// worker's user.
export async function seedApprovedWithPublishedStudyAgreement(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date() })

    const { id: legalDocumentId } = await findOrCreateLegalDocument(db, { type: 'SLA', studyId: study.id })
    const versionId = uuidv7()
    const filePath = pathForLegalDocumentVersion({ type: 'SLA', legalDocumentId, versionId })

    // No object uploaded: presigning does not need one and the spec never follows the link.
    await db
        .insertInto('legalDocumentVersion')
        .values({
            id: versionId,
            legalDocumentId,
            versionNumber: 1,
            fileName: 'study-agreement.pdf',
            format: 'pdf',
            filePath,
            publishedAt: new Date(),
            publishedBy: await resolveUserId('admin'),
            signedAt: '2026-01-01',
        })
        .execute()

    return { studyId: study.id }
}

// Local dev seeding only: the admin's Data Partner > Research Lab > study picker stays empty
// until studies exist across more than one org pair.
export async function seedStudyFor(
    overrides: Pick<StudyOverrides, 'title' | 'status' | 'enclaveSlug' | 'labSlug'>,
): Promise<SeedResult> {
    const status = overrides.status ?? 'APPROVED'
    const { study } = await insertStudy({
        ...overrides,
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null,
    })
    return { studyId: study.id }
}

export async function seedCodeSubmitted(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    await insertSubmittedJob(study.id, ['CODE-SUBMITTED'])
    return { studyId: study.id }
}

// Deliberately does NOT seed JOB-READY: it can outrank the upload's server-side RUN-COMPLETE
// in latestJobForStudy and strand the reviewer off the results-review screen.
export async function seedCodeApprovedJobReady(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED'])
    return { studyId: study.id, jobId: job.id }
}

export async function seedProposalRejected(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'REJECTED', rejectedAt: new Date() })
    return { studyId: study.id }
}

export async function seedProposalChangeRequested(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'CHANGE-REQUESTED' })
    return { studyId: study.id }
}

export async function seedCodeChangeRequested(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])
    return { studyId: study.id }
}

// The history deliberately ends on FILES-APPROVED with CODE-SCANNED earlier: the resubmit save
// gate must key on the decision, not the topmost status row.
export async function seedCodeResultsReady(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    await insertSubmittedJob(study.id, [
        'CODE-SUBMITTED',
        'CODE-SCANNED',
        'CODE-APPROVED',
        'RUN-COMPLETE',
        'FILES-APPROVED',
    ])
    return { studyId: study.id }
}

export async function seedCodeRejected(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({
        title,
        status: 'REJECTED',
        approvedAt: new Date(),
        rejectedAt: new Date(),
        agreementsAcked: true,
    })
    await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-REJECTED'])
    return { studyId: study.id }
}

// Legal documents are GLOBALLY scoped, so publishing one obliges every user of the database it
// lands in. Kept out of src/database/seeds, which also runs in deployed environments.

const PENDING_ACK_ROLE: SeedRole = 'legal'

const DISPOSABLE_DB_HOSTS = ['localhost', '127.0.0.1', 'postgres', 'db', 'db-unit-test']

const assertDisposableDatabase = () => {
    // Unset is refused rather than tolerated: databaseURL() falls back to the DB_SECRET_ARN secret,
    // which is how a deployed environment resolves its database.
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is not set, so there is no telling which database this would reach')

    const { hostname } = new URL(databaseUrl)
    if (!DISPOSABLE_DB_HOSTS.includes(hostname)) {
        throw new Error(
            `refusing to publish seeded legal documents to '${hostname}': Terms of Service and Privacy Notice are ` +
                'global, so every user of that environment would be blocked until they acknowledged a test stub',
        )
    }
}

// Two ToS versions let the `legal` role sit acknowledged at v1 and owing v2.
export const SEEDED_TOS_V2_BODY = 'This version supersedes v1.'

const TOS_CONTENT = [
    '# Terms of Service\n\nVersion 1. Seeded for end-to-end tests.\n',
    `# Terms of Service\n\nVersion 2. Seeded for end-to-end tests. ${SEEDED_TOS_V2_BODY}\n`,
]
const PN_CONTENT = ['# Privacy Notice\n\nVersion 1. Seeded for end-to-end tests.\n']

async function uploadLegalContent(key: string, content: string) {
    await getS3Client().send(new PutObjectCommand({ Bucket: s3BucketName(), Key: withS3Prefix(key), Body: content }))
}

const seededFileName = (type: 'TOS' | 'PN', index: number) => `${type}-v${index + 1}.md`

// Refuses when the existing versions are not the ones this wrote: a hand-published document
// would leave the specs asserting on content that is no longer current.
async function ensurePublishedVersions(type: 'TOS' | 'PN', contents: string[], publishedBy: string) {
    const { id: legalDocumentId } = await findOrCreateLegalDocument(db, { type })

    const existing = await db
        .selectFrom('legalDocumentVersion')
        .select(['id', 'versionNumber', 'fileName'])
        .where('legalDocumentId', '=', legalDocumentId)
        .where('publishedAt', 'is not', null)
        .orderBy('versionNumber')
        .execute()

    const unseeded = existing.filter(
        (version, index) => index >= contents.length || version.fileName !== seededFileName(type, index),
    )
    if (unseeded.length) {
        throw new Error(
            `${type} already has published versions this seed did not write ` +
                `(${unseeded.map((version) => version.fileName).join(', ')}). ` +
                'Reset the database and re-run `pnpm run db:migrate` before the e2e suite.',
        )
    }

    const versionIds = existing.map((version) => version.id)

    for (let index = existing.length; index < contents.length; index++) {
        const versionId = uuidv7()
        const filePath = pathForLegalDocumentVersion({ type, legalDocumentId, versionId })
        await uploadLegalContent(filePath, contents[index])

        const version = await db
            .insertInto('legalDocumentVersion')
            .values({
                id: versionId,
                legalDocumentId,
                filePath,
                fileName: seededFileName(type, index),
                format: 'markdown',
                versionNumber: index + 1,
                publishedAt: new Date(),
                publishedBy,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        versionIds.push(version.id)
    }

    return versionIds
}

async function acknowledgeVersions(userIds: string[], versionIds: string[]) {
    if (!userIds.length || !versionIds.length) return
    await db
        .insertInto('legalDocumentAcknowledgement')
        .values(
            userIds.flatMap((userId) =>
                versionIds.map((legalDocumentVersionId) => ({ legalDocumentVersionId, userId })),
            ),
        )
        .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
        .execute()
}

/**
 * Leaves `legal` owing exactly ToS v2 and everyone else up to date. Its rows are cleared first,
 * or a re-run would find nothing outstanding and show no modal.
 */
export async function seedLegalDocuments() {
    assertDisposableDatabase()

    const adminId = await resolveUserId('admin')

    const tosVersionIds = await ensurePublishedVersions('TOS', TOS_CONTENT, adminId)
    const pnVersionIds = await ensurePublishedVersions('PN', PN_CONTENT, adminId)

    const legalUserId = await resolveUserId(PENDING_ACK_ROLE)
    await db.deleteFrom('legalDocumentAcknowledgement').where('userId', '=', legalUserId).execute()

    const currentVersionIds = [tosVersionIds.at(-1), pnVersionIds.at(-1)].filter((id) => id !== undefined)

    // Every user, not just the fixture roles: local dev databases hold QA and developer logins,
    // and anyone left un-acked meets a modal quoting a test stub.
    const others = await db.selectFrom('user').select('id').where('id', '!=', legalUserId).execute()
    await acknowledgeVersions(
        others.map((user) => user.id),
        currentVersionIds,
    )

    await acknowledgeVersions([legalUserId], [...tosVersionIds.slice(0, 1), ...pnVersionIds.slice(-1)])
}

export { ENCLAVE_SLUG, LAB_SLUG }
