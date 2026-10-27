// Playwright and the app share one Postgres, so inserting rows here puts the app into a given
// study/job state without driving the browser. Everything targets the fixed identities
// `db:migrate` creates, so the app authorises the same role the tests sign in as.

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { v7 as uuidv7 } from 'uuid'
import { db, sql } from '@/database'
import type { Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { pathForLegalDocumentVersion, pathForStudyJobCodeFile } from '@/lib/paths'
import { findOrCreateLegalDocument, writeStudyAgreementVersion } from '@/server/db/legal-document'
import { getS3Client, s3BucketName, withS3Prefix } from '@/server/aws'
import { CODE_DECISION_JOB_STATUSES, ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'
import { createHash, createPublicKey } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CODE_FIXTURE = path.join(TESTS_DIR, 'fixtures', 'code-samples', 'analysis.r')
const PDF_FIXTURE = path.join(TESTS_DIR, 'assets', 'empty.pdf')

async function uploadObject(key: string, body: Buffer | string, contentType?: string) {
    await getS3Client().send(
        new PutObjectCommand({ Bucket: s3BucketName(), Key: withS3Prefix(key), Body: body, ContentType: contentType }),
    )
}

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
    // The persistent QA accounts (qa-review+*@safeinsights.org), the only ones /api/qa/* may touch.
    'qa-admin': '00000000-0000-4000-8000-000000000011',
    'qa-dp': '00000000-0000-4000-8000-000000000012',
    'qa-researcher': '00000000-0000-4000-8000-000000000013',
} as const

type SeedRole = keyof typeof FIXED_USER_IDS

const ROLE_EMAIL_ENV: Record<SeedRole, string> = {
    admin: 'CLERK_ADMIN_EMAIL',
    researcher: 'CLERK_RESEARCHER_EMAIL',
    reviewer: 'CLERK_REVIEWER_EMAIL',
    // Faked-auth only, never provisioned in Clerk, so this env var never resolves and the
    // fixed seed id wins.
    legal: 'CLERK_LEGAL_EMAIL',
    'qa-admin': 'CLERK_QA_ADMIN_EMAIL',
    'qa-dp': 'CLERK_QA_DP_EMAIL',
    'qa-researcher': 'CLERK_QA_RESEARCHER_EMAIL',
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

// The name the dashboards show for a seeded role.
export async function seededFullName(role: SeedRole): Promise<string> {
    const user = await db
        .selectFrom('user')
        .select('fullName')
        .where('id', '=', await resolveUserId(role))
        .executeTakeFirstOrThrow()
    return user.fullName
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
    // APPROVED studies carry an acknowledged Study Agreement by default: without one the gate
    // refuses every code submission and review decision. False only for specs about the gate.
    withStudyAgreement?: boolean
    // Only local dev seeding overrides these, to spread studies across org pairs so pickers
    // have something to narrow.
    enclaveSlug?: string
    labSlug?: string
    // Defaults to the researcher fixture; the QA API specs need studies owned by a qa- account.
    researcherId?: string
}

async function insertStudy(overrides: StudyOverrides) {
    const [enclave, lab, researcherId, reviewerId] = await Promise.all([
        resolveOrg(overrides.enclaveSlug ?? ENCLAVE_SLUG),
        resolveOrg(overrides.labSlug ?? LAB_SLUG),
        overrides.researcherId ?? resolveUserId('researcher'),
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

    if (status === 'APPROVED' && overrides.withStudyAgreement !== false) {
        await seedAcknowledgedStudyAgreement(study.id)
    }

    return { study, enclave, lab, researcherId, reviewerId }
}

// Everyone in either party org, not just the two role users: a member who owes the acknowledgement
// meets the blocking modal on every route of the study.
async function seedAcknowledgedStudyAgreement(studyId: string) {
    const version = await writeStudyAgreementVersion(db, {
        studyId,
        publishedBy: await resolveUserId('admin'),
        signedAt: '2026-01-01',
    })
    await acknowledgeStudyAgreementForParties(studyId, version.id)
    return version
}

async function acknowledgeStudyAgreementForParties(studyId: string, versionId: string) {
    const parties = await db
        .selectFrom('orgUser')
        .select('userId')
        .distinct()
        .where('orgId', 'in', (eb) =>
            eb
                .selectFrom('study')
                .select('study.orgId')
                .where('study.id', '=', studyId)
                .union(
                    eb.selectFrom('study').select('study.submittedByOrgId as orgId').where('study.id', '=', studyId),
                ),
        )
        .execute()

    if (!parties.length) return

    await db
        .insertInto('legalDocumentAcknowledgement')
        .values(parties.map(({ userId }) => ({ legalDocumentVersionId: versionId, userId })))
        .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
        .execute()
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

// Who the app records on each job status, so seeded studies attribute work as real ones do
// (OTTER-617): the reviewer decides, the enclave job API reports run stages with no user, and the
// lab's own actions, the scanner and the containerizer record the researcher.
const NO_USER_STATUSES: readonly StudyJobStatus[] = [
    'INITIATED',
    'JOB-PROVISIONING',
    'JOB-RUNNING',
    'RUN-COMPLETE',
    'JOB-ERRORED',
]
const REVIEWER_STATUSES: readonly StudyJobStatus[] = [...CODE_DECISION_JOB_STATUSES, ...ROUND_CLOSING_JOB_STATUSES]

const seededStatusActor = (status: StudyJobStatus, ids: { researcherId: string; reviewerId: string }) => {
    if (REVIEWER_STATUSES.includes(status)) return ids.reviewerId
    if (NO_USER_STATUSES.includes(status)) return null
    return ids.researcherId
}

// `statuses` are inserted oldest-first; the newest is what `latestJobForStudy` resolves.
async function insertSubmittedJob(
    studyId: string,
    statuses: StudyJobStatus[],
    {
        withMainCode = true,
        withReview = true,
        reviewRound = 1,
    }: { withMainCode?: boolean; withReview?: boolean; reviewRound?: number } = {},
) {
    const actors = { researcherId: await resolveUserId('researcher'), reviewerId: await resolveUserId('reviewer') }
    const job = await db.insertInto('studyJob').values({ studyId }).returning('id').executeTakeFirstOrThrow()

    if (withMainCode) {
        // Where the app reads a code file from (src/server/storage.ts), with the object behind it, so
        // the reviewer's code viewer and /dl/study-code serve the fixture rather than a load error.
        const enclave = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select('org.slug')
            .where('study.id', '=', studyId)
            .executeTakeFirstOrThrow()
        const codePath = pathForStudyJobCodeFile({ orgSlug: enclave.slug, studyId, studyJobId: job.id }, 'analysis.r')
        await uploadObject(codePath, fs.readFileSync(CODE_FIXTURE), 'text/plain')
        await db
            .insertInto('studyJobFile')
            .values({ studyJobId: job.id, name: 'analysis.r', path: codePath, fileType: 'MAIN-CODE' })
            .execute()
    }

    if (withReview) {
        await db
            .insertInto('studyReview')
            .values({
                studyJobId: job.id,
                report: sql`${JSON.stringify(buildReviewReport())}::jsonb`,
                round: reviewRound,
            })
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
                userId: seededStatusActor(status, actors),
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

export async function seedApprovedNoCode(
    title: string,
    { language = 'R' }: { language?: Language } = {},
): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), language })
    return { studyId: study.id }
}

// A Step 1 draft the researcher never carried further: the dashboard's delete control is its only exit.
export async function seedDraft(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'DRAFT', submittedAt: null })
    return { studyId: study.id }
}

// Approved, acknowledged by every member of both orgs, and with the PDF behind the version so the
// personal legal page's link (/dl/legal/:versionId) resolves to a real object.
export async function seedApprovedWithAcknowledgedStudyAgreementPdf(
    title: string,
): Promise<SeedResult & { versionId: string }> {
    const { study } = await insertStudy({
        title,
        status: 'APPROVED',
        approvedAt: new Date(),
        withStudyAgreement: false,
    })
    const version = await seedAcknowledgedStudyAgreement(study.id)
    await uploadObject(version.filePath, fs.readFileSync(PDF_FIXTURE), 'application/pdf')
    return { studyId: study.id, versionId: version.id }
}

// Study-scoped, unlike the Terms of Service, so publishing one inside a spec cannot reach another
// worker's user.
export async function seedApprovedWithPublishedStudyAgreement(title: string): Promise<SeedResult> {
    // Unacknowledged on purpose: this is the one seed whose study must still meet the modal.
    const { study } = await insertStudy({
        title,
        status: 'APPROVED',
        approvedAt: new Date(),
        withStudyAgreement: false,
    })

    // No object uploaded: presigning does not need one and the spec never follows the link.
    await writeStudyAgreementVersion(db, {
        studyId: study.id,
        publishedBy: await resolveUserId('admin'),
        signedAt: '2026-01-01',
    })

    return { studyId: study.id }
}

// Local dev seeding only: the admin's Data Partner > Research Lab > study picker stays empty
// until studies exist across more than one org pair.
export async function seedStudyFor(
    overrides: Pick<StudyOverrides, 'title' | 'status' | 'enclaveSlug' | 'labSlug' | 'withStudyAgreement'>,
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
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED'])
    return { studyId: study.id, jobId: job.id }
}

// The enclave-side stages between code approval and outputs, as the containerizer and the job
// API record them. The furthest stage in the history is what the pills read (study-job-status.ts).
export type SeededJobStage = 'JOB-PACKAGING' | 'JOB-PROVISIONING' | 'JOB-RUNNING'

const JOB_STAGE_HISTORY: Record<SeededJobStage, StudyJobStatus[]> = {
    'JOB-PACKAGING': ['JOB-PACKAGING'],
    'JOB-PROVISIONING': ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING'],
    'JOB-RUNNING': ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING'],
}

export async function seedJobStage(title: string, stage: SeededJobStage): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', ...JOB_STAGE_HISTORY[stage]])
    return { studyId: study.id, jobId: job.id }
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

export const SEEDED_RESUBMISSION_NOTE = 'Aggregated the counts as the reviewer asked.'

// One change request answered: the round-1 decision and the round-2 note sit on the same job,
// the way resubmitStudyCodeAction leaves them (OTTER-802). The AI summary is the second round's, or
// the reviewer page keeps polling for one.
export async function seedCodeResubmitted(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'], {
        reviewRound: 2,
    })

    // Between the seeded statuses, which insertSubmittedJob spaced a second apart.
    const now = Date.now()
    await db
        .insertInto('studyReviewComment')
        .values([
            {
                studyId: study.id,
                studyJobId: job.id,
                authorId: await resolveUserId('reviewer'),
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'NEEDS-CLARIFICATION',
                body: lexical('Requesting revisions to submitted code — please address criteria.'),
                criteria: { proposalAlignment: 'no', agreementCompliance: 'no', privacyProtection: 'no' },
                round: 1,
                createdAt: new Date(now - 2500),
            },
            {
                studyId: study.id,
                studyJobId: job.id,
                authorId: await resolveUserId('researcher'),
                reviewKind: 'CODE',
                entryType: 'RESUBMISSION-NOTE',
                body: lexical(SEEDED_RESUBMISSION_NOTE),
                round: 2,
                createdAt: new Date(now - 500),
            },
        ])
        .execute()

    return { studyId: study.id, jobId: job.id }
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

// Owned by the qa-researcher fixture, so the QA routes (which refuse any study whose researcher is
// not a qa- account) will act on it. Everything else matches the researcher fixture's studies.
export async function seedQaOwnedStudy(
    title: string,
    { status = 'APPROVED', researcherId }: { status?: StudyStatus; researcherId?: string } = {},
): Promise<SeedResult> {
    const { study } = await insertStudy({
        title,
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        researcherId: researcherId ?? (await resolveUserId('qa-researcher')),
    })
    return { studyId: study.id }
}

// A user that exists only to be acted on (invited, re-provisioned, deleted), never signed in as.
export async function seedThrowawayUser({
    emailPrefix,
    orgSlug,
    isAdmin = false,
    withPublicKey = false,
}: {
    emailPrefix: string
    orgSlug?: string
    isAdmin?: boolean
    withPublicKey?: boolean
}): Promise<{ userId: string; email: string }> {
    const email = `${emailPrefix}-${Date.now().toString(36)}-${uuidv7().slice(-6)}@example.com`
    const user = await db
        .insertInto('user')
        .values({ clerkId: `e2e-${uuidv7()}`, email, firstName: 'E2E', lastName: 'Throwaway' })
        .returning('id')
        .executeTakeFirstOrThrow()
    if (orgSlug) {
        const org = await resolveOrg(orgSlug)
        await db.insertInto('orgUser').values({ userId: user.id, orgId: org.id, isAdmin }).execute()
    }
    if (withPublicKey) await upsertTestPublicKey(user.id)
    return { userId: user.id, email }
}

// Mirrors the migration seed's code environment, with the scan the app opens on creation.
export async function seedCodeEnv({
    orgSlug,
    name,
    identifier,
    language = 'R',
    scanStatus = 'SCAN-PENDING',
}: {
    orgSlug: string
    name: string
    identifier: string
    language?: Language
    scanStatus?: SeededScanStatus
}): Promise<{ codeEnvId: string; name: string }> {
    const org = await resolveOrg(orgSlug)
    const env = await db
        .insertInto('orgCodeEnv')
        .values({
            orgId: org.id,
            name,
            identifier,
            language,
            url: 'public.ecr.aws/docker/library/r-base:latest',
            commandLines: { r: 'Rscript main.r' },
            starterCodeFileNames: ['main.r'],
            isTesting: false,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db.insertInto('codeScan').values({ codeEnvId: env.id, status: scanStatus }).execute()
    return { codeEnvId: env.id, name }
}

export type SeededScanStatus = 'SCAN-PENDING' | 'SCAN-RUNNING' | 'SCAN-COMPLETE' | 'SCAN-FAILED'

export type SeededOrgRef = { id: string; slug: string; name: string }

// A fresh organization for the admin specs, so renaming, deleting, publishing a participation
// agreement or designating a test lab never touches the fixture orgs that every other worker uses.
// Enclaves get the test public key, as the dev seed gives openstax.
export async function seedOrg({
    type,
    adminRoles = [],
    memberRoles = [],
}: {
    type: 'enclave' | 'lab'
    adminRoles?: SeedRole[]
    memberRoles?: SeedRole[]
}): Promise<SeededOrgRef> {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(-5)}`
    const slug = `e2e-${type}-${suffix}`
    const name = `E2E ${type === 'enclave' ? 'Partner' : 'Lab'} ${suffix}`
    const org = await db
        .insertInto('org')
        .values({
            slug,
            name,
            email: `${slug}@example.com`,
            type,
            settings: type === 'enclave' ? { publicKey: readSupportFile('public_key.pem') } : {},
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const memberships = [
        ...adminRoles.map((role) => ({ role, isAdmin: true })),
        ...memberRoles.map((role) => ({ role, isAdmin: false })),
    ]
    for (const membership of memberships) {
        await db
            .insertInto('orgUser')
            .values({ orgId: org.id, userId: await resolveUserId(membership.role), isAdmin: membership.isAdmin })
            .execute()
    }
    return { id: org.id, slug, name }
}

// An open invitation, as orgAdminInviteUserAction leaves it.
export async function seedInvite({
    orgSlug,
    email,
    isAdmin = false,
}: {
    orgSlug: string
    email: string
    isAdmin?: boolean
}): Promise<{ inviteId: string }> {
    const org = await resolveOrg(orgSlug)
    const invite = await db
        .insertInto('pendingUser')
        .values({ orgId: org.id, email, isAdmin, invitedByUserId: await resolveUserId('admin') })
        .returning('id')
        .executeTakeFirstOrThrow()
    return { inviteId: invite.id }
}

// A saved-but-unpublished draft of a global document outlives the run that saved it, and the upload
// modal resumes on it. Cleared by the one spec that drafts, so it meets the upload step every time.
export async function seedClearUnpublishedLegalDrafts(type: 'TOS' | 'PN') {
    const { id: legalDocumentId } = await findOrCreateLegalDocument(db, { type })
    await db
        .deleteFrom('legalDocumentVersion')
        .where('legalDocumentId', '=', legalDocumentId)
        .where('publishedAt', 'is', null)
        .execute()
}

// Approved, with no Study Agreement yet: the state the SI admin's upload form lists.
export async function seedApprovedAwaitingStudyAgreement(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({
        title,
        status: 'APPROVED',
        approvedAt: new Date(),
        withStudyAgreement: false,
    })
    return { studyId: study.id }
}

// Read-only views for the API specs, which have no screen to assert through.
export async function jobStatusRows(jobId: string) {
    return db
        .selectFrom('jobStatusChange')
        .select(['status', 'message'])
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt')
        .orderBy('id')
        .execute()
}

export async function jobFileTypes(jobId: string): Promise<string[]> {
    const rows = await db.selectFrom('studyJobFile').select('fileType').where('studyJobId', '=', jobId).execute()
    return rows.map((row) => row.fileType)
}

export async function studyExists(studyId: string): Promise<boolean> {
    return !!(await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst())
}

export async function userExists(userId: string): Promise<boolean> {
    return !!(await db.selectFrom('user').select('id').where('id', '=', userId).executeTakeFirst())
}

// Legal documents are GLOBALLY scoped, so publishing one obliges every user of the database it
// lands in. Kept out of src/database/seeds, which also runs in deployed environments.

const PENDING_ACK_ROLE: SeedRole = 'legal'

const DISPOSABLE_DB_HOSTS = ['localhost', '127.0.0.1', 'postgres', 'db', 'db-unit-test']

// No CI exemption on purpose: CI service hostnames are already in the list above, so a bypass
// would only remove the check where no human is looking at the target database.
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

const uploadLegalContent = (key: string, content: string) => uploadObject(key, content)

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
 * Runs only from global.setup.ts, before any worker starts: a mid-run publish blocks every other worker.
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

const readSupportFile = (name: string) => fs.readFileSync(path.join(TESTS_DIR, 'support', name), 'utf8')

/**
 * Pins a fixture user's key back to tests/support/public_key.pem. Every decrypt flow opens outputs
 * with the matching private key, so a key regenerated against this database (by a spec, or by hand)
 * would strand the next run at the Security key step. Runs from global.setup.ts for every role.
 */
export async function seedRestoreTestPublicKey(role: SeedRole) {
    await upsertTestPublicKey(await resolveUserId(role))
}

async function upsertTestPublicKey(userId: string) {
    // The same SPKI DER bytes si-encryption's pemToArrayBuffer yields, without importing its
    // TypeScript sources, which Node will not type-strip from node_modules.
    const publicKey = createPublicKey(readSupportFile('public_key.pem')).export({ type: 'spki', format: 'der' })
    // The hex SHA-256 of that DER, as si-encryption's fingerprintKeyData computes it and the migration
    // seed stores it; public_key.sig holds the same digest behind openssl's "SHA2-256(stdin)= " prefix.
    const fingerprint = createHash('sha256').update(publicKey).digest('hex')
    await db
        .insertInto('userPublicKey')
        .values({ userId, publicKey, fingerprint })
        .onConflict((oc) => oc.column('userId').doUpdateSet({ publicKey, fingerprint }))
        .execute()
}

export { ENCLAVE_SLUG, LAB_SLUG }
