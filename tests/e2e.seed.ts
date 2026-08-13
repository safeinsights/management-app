// E2e study-data seeding.
//
// The Playwright process and the running app share one Postgres (DATABASE_URL),
// so seeding rows here puts the app into the exact study/job state a test needs
// without re-driving the propose -> approve -> upload pipeline through the
// browser. This is the e2e analogue of the pure inserts in
// `tests/unit.helpers.tsx`; it lives in its own file because unit.helpers imports
// `vitest` and `@testing-library/react` at the top level, neither of which loads
// under Playwright.
//
// Everything targets the fixed identities created once by `db:migrate`
// (`src/database/seeds/1743608138837_test_users.ts` + `bin/seed-environment.ts`).
// No orgs or users are created at runtime — a seeded study is owned by the real
// researcher test account and reviewed by the real openstax enclave, so the app
// authorises the same role the tests sign in as.

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { v7 as uuidv7 } from 'uuid'
import { db, sql } from '@/database'
import type { Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import { findOrCreateLegalDocument } from '@/server/db/legal-document'
import { getS3Client, s3BucketName, withS3Prefix } from '@/server/aws'

// openstax is the canonical e2e org pair: the researcher submits from the lab
// (openstax-lab) and the reviewer reviews in the enclave (openstax). Matches the
// org-split a UI-created study produces (submittedByOrgId = lab, orgId = enclave).
const ENCLAVE_SLUG = 'openstax'
const LAB_SLUG = 'openstax-lab'

// Fixed UUIDs the seeds assign to the test users. Used only as a fallback: in PR
// environments a user who logged in before seeding owns their email under a
// random UUID, and seed-environment adopts that row instead. So resolve by email
// first (the row the app actually authenticates as) and fall back to the fixed id.
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
    // Faked-auth only, never provisioned in Clerk, so there is no env override to resolve by. The
    // empty name simply never matches, leaving the fixed seed id as the answer.
    legal: 'CLERK_LEGAL_EMAIL',
}

// --- identity resolution -----------------------------------------------------

const userIdCache = new Map<SeedRole, string>()

// Resolve the canonical DB user id for a seeded role. Prefer the row that owns
// the role's Clerk email (what the app signs in as), falling back to the fixed
// seed UUID. Cached because every factory needs the researcher id.
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

// The lexical fields (researchQuestions / projectSummary / impact) are jsonb
// columns holding a Lexical editor state, not plain text. Wrap a string in the
// minimal `{root}` shape the app stores so the read-only review screens render it.
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

// --- low-level inserts -------------------------------------------------------

type StudyOverrides = {
    title: string
    status?: StudyStatus
    language?: Language
    datasets?: string[] | null
    submittedAt?: Date | null
    approvedAt?: Date | null
    rejectedAt?: Date | null
    // When the flow has progressed past the agreements gate (code upload / review),
    // both sides have acked. Seed those timestamps so the state machine resolves the
    // code screens instead of bouncing back to the agreements gate.
    agreementsAcked?: boolean
    // Default to the canonical e2e pair. Only local dev seeding overrides these, to
    // spread studies across org pairs so pickers have something to narrow.
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
            // A decided study carries the reviewer who acted on it; the review screens
            // read this to render the decision author.
            reviewerId: status === 'PENDING-REVIEW' || status === 'DRAFT' ? null : reviewerId,
            containerLocation: 'test-container',
            title: overrides.title,
            piName: 'E2E Test PI',
            // The proposal form requires a valid piUserId (uuid); without it the
            // edit-and-resubmit form is invalid and its submit button stays disabled.
            piUserId: researcherId,
            status,
            language: overrides.language ?? 'R',
            dataSources: ['all'],
            // The proposal form requires at least one dataset, so the edit-and-resubmit
            // form stays valid when pre-filled. Seed a concrete value, not null.
            datasets: overrides.datasets ?? ['Student Activity Logs'],
            outputMimeType: 'application/zip',
            submittedAt: overrides.submittedAt === undefined ? new Date() : overrides.submittedAt,
            approvedAt: overrides.approvedAt ?? null,
            rejectedAt: overrides.rejectedAt ?? null,
            researcherAgreementsAckedAt: acked,
            reviewerAgreementsAckedAt: acked,
            // Lexical editor state (jsonb), wrapped from text so the read-only review
            // screens render real content.
            researchQuestions: lexical('What is the impact of highlighting on student outcomes?'),
            projectSummary: lexical('We analyze archival data to study highlighting behavior.'),
            impact: lexical('This research will improve understanding of study habits.'),
        })
        .returning(['id', 'orgId', 'submittedByOrgId', 'researcherId'])
        .executeTakeFirstOrThrow()

    return { study, enclave, lab, researcherId, reviewerId }
}

// A submitted job with a MAIN-CODE file and the given status history. `statuses`
// are inserted oldest-first; the newest is what `latestJobForStudy` resolves.
// A landed AI-summary report. In prod this is written by a deferred background task
// (onStudyReviewRequested) at code submission; the reviewer code-review screen polls
// study_review until a row lands and gates the feedback editor on it. Without this the
// UI is stuck on "AI Summary is loading", so seeded code-submitted jobs insert one.
function buildReviewReport() {
    return {
        proposalSummary: 'Seeded proposal summary for e2e.',
        codeExplanation: 'Seeded AI summary: the code reads the dataset and aggregates results.',
        resultsSummary: 'Seeded results summary.',
        alignmentCheck: { isAligned: true, findings: [] },
        complianceCheck: { isCompliant: true, findings: [] },
    }
}

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

    // Land a terminal study_review row so the reviewer code-review screen's AI-summary
    // poll resolves and the feedback editor renders (mirrors the deferred prod task).
    if (withReview) {
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: sql`${JSON.stringify(buildReviewReport())}::jsonb` })
            .execute()
    }

    // Space the status rows so createdAt ordering is deterministic (the latest-job query
    // orders by createdAt then id). Stamp them in the PAST (oldest furthest back, newest
    // ~1s ago) so any status a later step appends via the real API (e.g. the results
    // upload's RUN-COMPLETE at server-now) reliably sorts AFTER the seeded ones — seeding
    // future timestamps would let CODE-APPROVED outrank a freshly-uploaded RUN-COMPLETE.
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

// --- public factories --------------------------------------------------------
//
// Each returns the new studyId already in the named state. Pass a unique title
// (use `studyFeatures.uniqueTitle(...)`) so studies stay isolated per worker.
// Factories that create a submitted job also return its `jobId` so result/error
// flows can upload via the debug script (`bin/debug/upload-results.ts`) directly,
// without polling `/api/studies/ready` — there is no external job runner on CI.

export type SeedResult = { studyId: string; jobId?: string }

// PENDING-REVIEW proposal, no code. For reviewer proposal-decision tests
// (approve / reject / request-clarification) and the proposal-only review view.
export async function seedProposalPendingReview(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'PENDING-REVIEW' })
    return { studyId: study.id }
}

// APPROVED proposal with no job yet. For the researcher code-upload entry flow
// (the /submitted -> /agreements/researcher -> /code path).
export async function seedApprovedNoCode(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date() })
    return { studyId: study.id }
}

// As above but against a named org pair. For local dev seeding only: an SLA belongs to a
// study, so the admin's Data Partner > Research Lab > study picker is empty until studies
// exist across more than one pair.
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

// APPROVED proposal + a submitted job in CODE-SUBMITTED, agreements acked. For
// reviewer code-review tests (approve / request-revision / reject) and the
// two-context code-review collaboration spec.
export async function seedCodeSubmitted(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    await insertSubmittedJob(study.id, ['CODE-SUBMITTED'])
    return { studyId: study.id }
}

// Code already approved; the job is ready to receive results. The caller then uploads an
// encrypted result/error log via the debug script, which POSTs /api/job/[jobId]/results
// and appends the definitive latest status (RUN-COMPLETE for results, JOB-ERRORED for
// logs). We intentionally do NOT seed JOB-READY here: that status carries a later
// timestamp than the upload's server-side insert in some runs, which would make
// latestJobForStudy resolve to JOB-READY instead of RUN-COMPLETE and strand the reviewer
// off the results-review screen. Latest seeded status is CODE-APPROVED; the upload owns
// the terminal one. Returns the jobId for the upload step.
export async function seedCodeApprovedJobReady(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED'])
    return { studyId: study.id, jobId: job.id }
}

// Proposal rejected (terminal). For dashboard/status + post-submission rejected-view tests.
export async function seedProposalRejected(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'REJECTED', rejectedAt: new Date() })
    return { studyId: study.id }
}

// Proposal needs clarification (CHANGE-REQUESTED, no code). For the clarification
// banner + edit-and-resubmit CTA tests.
export async function seedProposalChangeRequested(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'CHANGE-REQUESTED' })
    return { studyId: study.id }
}

// Code reviewed with a change request (resubmittable). For the researcher
// code-change-requested banner + resubmit-code tests.
export async function seedCodeChangeRequested(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])
    return { studyId: study.id }
}

// Results ready: code ran and the reviewer approved the files (FILES-APPROVED closes the round).
// This is a resubmittable state (the researcher can revise and resubmit code). The status history
// deliberately ends on FILES-APPROVED with the automated CODE-SCANNED earlier, mirroring the QA
// scenario where the resubmit save gate must key on the decision, not the topmost status row.
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

// Code hard-rejected (terminal, study ends). For the terminal rejected-code-view tests.
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

// --- legal documents ---------------------------------------------------------
//
// Terms of Service and Privacy Notice are GLOBALLY scoped — one document each, applying to every
// user — so publishing one from inside a test would make every other worker's user instantly owe an
// acknowledgement and block them. Nothing here may run during a spec; global.setup calls it once
// before any worker starts.
//
// It lives here rather than in src/database/seeds because those seeds also execute in deployed
// environments via the migrator Lambda, and a stub Terms of Service must never be published there.

// The one role deliberately left owing something. Every other seeded role is brought up to date.
const PENDING_ACK_ROLE: SeedRole = 'legal'

// Hosts whose database is disposable: a docker-compose service, a CI service container, or a local
// one. Publishing a Terms of Service obliges every user of whatever database it lands in, and these
// documents read "Seeded for end-to-end tests", so anywhere shared has to refuse rather than gate
// real people behind a stub.
const DISPOSABLE_DB_HOSTS = ['localhost', '127.0.0.1', 'postgres', 'db', 'db-unit-test']

// Runs on CI too: the CI service hostnames are already listed above, so exempting CI would only
// remove the check where no human is looking at the target.
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

// Two Terms of Service versions so the `legal` role can sit acknowledged at v1 and owing v2, which
// is the "has been updated" path the card is about.
const TOS_CONTENT = [
    '# Terms of Service\n\nVersion 1. Seeded for end-to-end tests.\n',
    '# Terms of Service\n\nVersion 2. Seeded for end-to-end tests. This version supersedes v1.\n',
]
const PN_CONTENT = ['# Privacy Notice\n\nVersion 1. Seeded for end-to-end tests.\n']

async function uploadLegalContent(key: string, content: string) {
    await getS3Client().send(new PutObjectCommand({ Bucket: s3BucketName(), Key: withS3Prefix(key), Body: content }))
}

// Published version ids for a document, oldest first. Tops up to `contents.length` so a re-run
// against a database that already holds the seeded versions adds nothing.
async function ensurePublishedVersions(type: 'TOS' | 'PN', contents: string[], publishedBy: string) {
    const { id: legalDocumentId } = await findOrCreateLegalDocument(db, { type })

    const existing = await db
        .selectFrom('legalDocumentVersion')
        .select(['id', 'versionNumber'])
        .where('legalDocumentId', '=', legalDocumentId)
        .where('publishedAt', 'is not', null)
        .orderBy('versionNumber')
        .execute()

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
                fileName: `${type}-v${index + 1}.md`,
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
 * Put every e2e role into a known acknowledgement state.
 *
 * Every role but `legal` is acknowledged up to date, so the gate never fires for the specs that use
 * them. `legal` is acknowledged at Terms of Service v1 and at the current Privacy Notice, leaving
 * exactly one thing outstanding — ToS v2 — so the modal takes the "has been updated" path rather
 * than the neutral wording it uses when a new and an updated document arrive together.
 *
 * Its rows are cleared first: the spec acknowledges v2, so a re-run against the same database would
 * otherwise find nothing outstanding and no modal.
 */
export async function seedLegalDocuments() {
    assertDisposableDatabase()

    const adminId = await resolveUserId('admin')

    const tosVersionIds = await ensurePublishedVersions('TOS', TOS_CONTENT, adminId)
    const pnVersionIds = await ensurePublishedVersions('PN', PN_CONTENT, adminId)

    const legalUserId = await resolveUserId(PENDING_ACK_ROLE)
    await db.deleteFrom('legalDocumentAcknowledgement').where('userId', '=', legalUserId).execute()

    const currentVersionIds = [tosVersionIds.at(-1), pnVersionIds.at(-1)].filter((id) => id !== undefined)

    // Every other user in the database, not just the fixture roles. This also runs against a local
    // dev database holding QA logins and the developer's own row, and anyone left un-acked meets a
    // modal quoting a test stub with no clue which test run put it there.
    const others = await db.selectFrom('user').select('id').where('id', '!=', legalUserId).execute()
    await acknowledgeVersions(
        others.map((user) => user.id),
        currentVersionIds,
    )

    await acknowledgeVersions([legalUserId], [...tosVersionIds.slice(0, 1), ...pnVersionIds.slice(-1)])
}

export { ENCLAVE_SLUG, LAB_SLUG }
