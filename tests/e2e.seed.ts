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

import { db, sql } from '@/database'
import type { Language, StudyJobStatus, StudyStatus } from '@/database/types'

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
} as const

type SeedRole = keyof typeof FIXED_USER_IDS

const ROLE_EMAIL_ENV: Record<SeedRole, string> = {
    admin: 'CLERK_ADMIN_EMAIL',
    researcher: 'CLERK_RESEARCHER_EMAIL',
    reviewer: 'CLERK_REVIEWER_EMAIL',
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
}

async function insertStudy(overrides: StudyOverrides) {
    const [enclave, lab, researcherId, reviewerId] = await Promise.all([
        resolveOrg(ENCLAVE_SLUG),
        resolveOrg(LAB_SLUG),
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
            status,
            language: overrides.language ?? 'R',
            dataSources: ['all'],
            datasets: overrides.datasets ?? null,
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
async function insertSubmittedJob(
    studyId: string,
    statuses: StudyJobStatus[],
    { withMainCode = true }: { withMainCode?: boolean } = {},
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

    // Space the status rows so createdAt ordering is deterministic (the latest-job
    // query orders by createdAt then id; identical timestamps would rely on id only).
    const base = Date.now()
    await db
        .insertInto('jobStatusChange')
        .values(
            statuses.map((status, i) => ({ studyJobId: job.id, status, userId, createdAt: new Date(base + i * 1000) })),
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
// (the /submitted -> /agreements -> /code path).
export async function seedApprovedNoCode(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date() })
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

// Code already approved and the job has reached JOB-READY. `/api/studies/ready` is a
// pure DB query (APPROVED + a JOB-READY/JOB-RUNNING row + no terminal status), so the
// seeded job is immediately "ready" — no runner involved. Returns the jobId so the
// caller can upload an encrypted result/error log via the debug script and then drive
// the reviewer decrypt+approve UI. Precondition for "successful results review" and
// the error-log review flow.
export async function seedCodeApprovedJobReady(title: string): Promise<SeedResult> {
    const { study } = await insertStudy({ title, status: 'APPROVED', approvedAt: new Date(), agreementsAcked: true })
    const job = await insertSubmittedJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY'])
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

export { ENCLAVE_SLUG, LAB_SLUG }
