import { db } from '@/database'
import type { Json, Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { latestJobForStudy } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { lexicalJson } from '@/lib/lexical'
import type { StudyRow } from '@/components/dashboard/studies-table/types'
import type { ScreenComponentProps } from '@/app/[orgSlug]/study/[studyId]/_screens/types'
import { expect } from 'vitest'
import { seedAcknowledgedStudyAgreement } from './legal'
import { insertTestOrg, type MinimalTestOrg } from './orgs'
import { insertTestUser } from './users'

// Screen components take the raw study state their rules routed on (see render-screen.tsx).
export type ScreenInputs = Pick<ScreenComponentProps, 'study' | 'raw'>

export const requireRawState = async (studyId: string) => {
    const raw = await rawStudyStateForStudy(studyId, db)
    if (!raw) throw new Error(`no raw study state for study ${studyId}`)
    return raw
}

export const insertTestStudyData = async ({
    org,
    researcherId,
    useRealKeys = false,
}: {
    org: MinimalTestOrg
    researcherId?: string
    useRealKeys?: boolean
}) => {
    if (!researcherId) {
        const { user } = await insertTestUser({ org, useRealKeys })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: org.id,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcherId,
            piName: 'test',
            irbProtocols: 'https://www.google.com',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const job0 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'INITIATED', studyJobId: job0.id, userId: researcherId })
        .execute()

    const job1 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'JOB-RUNNING', studyJobId: job1.id, userId: researcherId })
        .execute()

    const job2 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'JOB-READY', studyJobId: job2.id, userId: researcherId })
        .execute()

    return {
        orgId: org.id,
        studyId: study.id,
        jobs: [job0, job1, job2],
        jobIds: [job0.id, job1.id, job2.id],
        researcherId: researcherId,
    }
}

// `jobInfo` is nested rather than spread alongside `org` because `storeS3File` tags the uploaded
// object with every property it is handed, so anything but the three string fields throws.
export const insertTestJobInfo = async ({ org }: { org?: MinimalTestOrg } = {}) => {
    const testOrg = org ?? (await insertTestOrg())
    const { studyId, jobIds } = await insertTestStudyData({ org: testOrg })

    return { jobInfo: { orgSlug: testOrg.slug, studyId, studyJobId: jobIds[0] }, org: testOrg }
}

export const insertTestStudyJobData = async ({
    org,
    submittedByOrg,
    researcherId,
    studyStatus = 'APPROVED',
    jobStatus = 'JOB-READY',
    language,
    title,
    piName,
    researchQuestions,
    projectSummary,
    impact,
    additionalNotes,
    datasets,
    withStudyAgreement = true,
}: {
    org?: MinimalTestOrg
    // See insertTestStudyOnly: puts the Data Partner and the Research Lab on different orgs.
    submittedByOrg?: MinimalTestOrg
    researcherId?: string
    studyStatus?: StudyStatus
    jobStatus?: StudyJobStatus
    language?: Language
    title?: string
    piName?: string
    datasets?: string[] | null
    researchQuestions?: Json | null
    projectSummary?: Json | null
    impact?: Json | null
    additionalNotes?: Json | null
    withStudyAgreement?: boolean
} = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    if (!researcherId) {
        const { user } = await insertTestUser({ org: submittedByOrg ?? org })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: (submittedByOrg ?? org).id,
            containerLocation: 'test-container',
            title: title ?? 'my 1st study',
            researcherId: researcherId,
            piName: piName ?? 'test',
            status: studyStatus,
            submittedAt: studyStatus === 'DRAFT' ? null : new Date(),
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: language || 'R',
            datasets: datasets ?? null,
            researchQuestions: researchQuestions ?? null,
            projectSummary: projectSummary ?? null,
            impact: impact ?? null,
            additionalNotes: additionalNotes ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const job = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const studyJobStatus = await db
        .insertInto('jobStatusChange')
        .values({
            status: jobStatus,
            studyJobId: job.id,
            userId: researcherId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    if (withStudyAgreement) await seedAcknowledgedStudyAgreement(study.id)

    const latestJobWithStatus = await latestJobForStudy(study.id)

    return {
        job,
        org,
        study,
        studyJobStatus,
        latestJobWithStatus,
    }
}

// A baseline job is the file-less INITIATED row minted when a workspace is opened, before any
// code is submitted.
export const insertTestBaselineJob = async (studyId: string, { createdAt }: { createdAt?: Date } = {}) => {
    const job = await db
        .insertInto('studyJob')
        .values(createdAt ? { studyId, createdAt } : { studyId })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'INITIATED' }).executeTakeFirstOrThrow()
    return job
}

// Advances a job that already has CODE-SUBMITTED to round 2 (change request + resubmit). Timestamps
// are staggered after `after` so they sort after the original submission.
export const appendCodeResubmission = async (studyJobId: string, after: Date = new Date()) => {
    const base = after.getTime()
    await db
        .insertInto('jobStatusChange')
        .values([
            {
                studyJobId,
                status: 'CODE-CHANGES-REQUESTED',
                createdAt: new Date(base + 1000),
            },
            {
                studyJobId,
                status: 'CODE-SUBMITTED',
                createdAt: new Date(base + 2000),
            },
        ])
        .execute()
}

type InsertTestCodeResubmissionNoteOptions = {
    studyId: string
    studyJobId: string
    authorId: string
    round: number
    text?: string
    createdAt?: Date
}

// The row resubmitStudyCodeAction writes for a round's note (OTTER-802).
export const insertTestCodeResubmissionNote = async ({
    studyId,
    studyJobId,
    authorId,
    round,
    text = 'addressed the feedback',
    createdAt,
}: InsertTestCodeResubmissionNoteOptions) =>
    db
        .insertInto('studyReviewComment')
        .values({
            studyId,
            studyJobId,
            authorId,
            reviewKind: 'CODE',
            entryType: 'RESUBMISSION-NOTE',
            body: JSON.parse(lexicalJson(text)),
            round,
            ...(createdAt ? { createdAt } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()

// Pass `submittedByOrg` to put the two sides of a study on DIFFERENT orgs (orgId is the Data
// Partner, submittedByOrgId the Research Lab); a swapped join passes silently on a single org.
export const insertTestStudyOnly = async ({
    org,
    submittedByOrg,
    researcherId,
    title = 'study without job',
    status = 'APPROVED',
    isTestStudy = false,
    // False for a test about agreements themselves — those files publish and acknowledge their own.
    withStudyAgreement = true,
}: {
    org?: MinimalTestOrg
    submittedByOrg?: MinimalTestOrg
    researcherId?: string
    title?: string
    status?: StudyStatus
    isTestStudy?: boolean
    withStudyAgreement?: boolean
} = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    if (!researcherId) {
        const { user } = await insertTestUser({ org: submittedByOrg ?? org })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: (submittedByOrg ?? org).id,
            containerLocation: 'test-container',
            title,
            researcherId,
            piName: 'test',
            status,
            isTestStudy,
            submittedAt: new Date(),
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    if (withStudyAgreement) await seedAcknowledgedStudyAgreement(study.id)

    return { org, study }
}

export const insertTestStudyJobUsers = async ({
    org,
    useRealKeys = false,
}: { org?: MinimalTestOrg; useRealKeys?: boolean } = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    const { user: user1 } = await insertTestUser({ org, useRealKeys })
    const { user: user2 } = await insertTestUser({ org, useRealKeys })

    const { study, job, ...rest } = await insertTestStudyJobData({ org, researcherId: user1.id })

    return { study, job, user1, user2, ...rest }
}

export const insertTestOrgStudyJobUsers = async () => {
    const org = await insertTestOrg()
    const result = await insertTestStudyJobUsers({ org })
    return { ...result, org }
}

// A Data Partner's decision on the proposal, as submitProposalReviewAction records it.
export const insertTestProposalDecision = ({ studyId, authorId }: { studyId: string; authorId: string }) =>
    db
        .insertInto('studyProposalComment')
        .values({
            studyId,
            authorId,
            authorRole: 'REVIEWER',
            entryType: 'REVIEWER-FEEDBACK',
            decision: 'NEEDS-CLARIFICATION',
            body: JSON.stringify({ text: 'please clarify the methodology' }),
            version: 1,
        })
        .execute()

export const setTestStudyStatus = (studyId: string, status: StudyStatus) =>
    db.updateTable('study').set({ status }).where('id', '=', studyId).execute()

// The default 60 tokens is ~400 characters, comfortably inside every 1800-character cap.
// Build the string directly when a test is about a boundary.
export const buildFeedback = (tokenCount = 60) => Array.from({ length: tokenCount }, (_, i) => `word${i + 1}`).join(' ')

export const expectStudyJobRecords = async (
    studyId: string,
    expectedFiles: Array<{ name: string; fileType: string }>,
) => {
    const latestJob = await db
        .selectFrom('studyJob')
        .select(['id'])
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirstOrThrow()

    const jobFiles = await db
        .selectFrom('studyJobFile')
        .select(['name', 'fileType'])
        .where('studyJobId', '=', latestJob.id)
        .orderBy('fileType', 'asc')
        .execute()
    expect(jobFiles).toEqual(expectedFiles)

    // The SET of statuses, not their order: CODE-SUBMITTED and CODE-SCANNED are written in the
    // same operation and can share a created_at to the millisecond.
    const statuses = await db
        .selectFrom('jobStatusChange')
        .select(['status'])
        .where('studyJobId', '=', latestJob.id)
        .execute()
    expect(statuses.map((row) => row.status).sort()).toEqual(['CODE-SCANNED', 'CODE-SUBMITTED', 'INITIATED'])
}

export const mockStudyRow = (overrides: Partial<StudyRow> = {}): StudyRow => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Test Study',
    status: 'APPROVED',
    createdAt: new Date(),
    submittedAt: new Date(),
    lastUpdatedAt: new Date(),
    reviewerName: null,
    researcherId: 'researcher-1',
    reviewerId: null,
    createdBy: 'Researcher Name',
    jobStatusChanges: [],
    researcherAgreementsAckedAt: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
    ...overrides,
})
