import type React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import StudyReviewPage from './page'
import { ProposalReviewView } from './proposal-review-view'
import { PostFeedbackView } from './post-feedback-view'
import { CodeReview } from './code-review'
import { SecondaryAnalysisView } from './secondary-analysis-view'
import { StudyDetailsReviewer } from './study-details-reviewer'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

// Append a job status strictly after the latest existing one so multi-status histories keep a
// stable order (mirrors the helper the deleted /view cascade test used).
const addJobStatus = async (studyId: string, status: StudyJobStatus) => {
    const job = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).executeTakeFirstOrThrow()
    const last = await db
        .selectFrom('jobStatusChange')
        .select('createdAt')
        .where('studyJobId', '=', job.id)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()
    const base = last?.createdAt ? new Date(last.createdAt).getTime() : Date.now()
    await db
        .insertInto('jobStatusChange')
        .values({ status, studyJobId: job.id, createdAt: new Date(base + 1000) })
        .execute()
}

const ackReviewerAgreements = (studyId: string) =>
    db.updateTable('study').set({ reviewerAgreementsAckedAt: new Date() }).where('id', '=', studyId).execute()

// The page's return type is the ReactNode union (guard branches can hand back AlertNotFound JSX),
// so narrow to an element to read `.type` / pass to render.
const callPage = async (orgSlug: string, studyId: string) =>
    (await StudyReviewPage({
        params: Promise.resolve({ orgSlug, studyId }),
    })) as React.ReactElement<Record<string, unknown>>

describe('StudyReviewPage', () => {
    it('redirects a lab org to the researcher /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        await expect(callPage(org.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    // Permission gating lives in reviewerPageGuard, which keys off the review ABILITY (granted to SI
    // admins via manage/all) rather than org membership, so an SI admin can review any org's study.
    it('lets an SI admin review a study for an enclave org they do not belong to', async () => {
        const { user: siAdmin } = await mockSessionWithTestData({ isSiAdmin: true })
        const reviewingOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        // No job (insertTestStudyOnly): a proposal under review has no submitted code
        const { study } = await insertTestStudyOnly({ org: reviewingOrg, researcherId: siAdmin.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await callPage(reviewingOrg.slug, study.id)

        // No code submitted yet → the proposal review flow, NOT AccessDeniedAlert.
        expect(page?.type).toBe(ProposalReviewView)
        expect(page?.type).not.toBe(AccessDeniedAlert)
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('does not let a non-member, non-SI user reach the review flow for another org', async () => {
        // A plain enclave reviewer of a DIFFERENT org has no view access to this study, so the guard's
        // view gate denies first (AlertNotFound). The key assertion is the negative: they never reach
        // the active review flow and are never treated as a reviewer.
        await mockSessionWithTestData({ orgType: 'enclave' })
        const otherOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org: otherOrg,
            studyStatus: 'PENDING-REVIEW',
        })

        const page = await callPage(otherOrg.slug, study.id)

        expect(page?.type).not.toBe(ProposalReviewView)
        expect(page?.type).not.toBe(CodeReview)
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('renders AlertNotFound for a non-submitted (DRAFT) study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'DRAFT')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(AlertNotFound)
    })

    it('renders ProposalReviewView for a PENDING-REVIEW proposal with no code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(ProposalReviewView)
    })

    it('renders PostFeedbackView for a decided proposal with no code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'CHANGE-REQUESTED')

        const page = await callPage(org.slug, study.id)

        // Distinguish from the code-feedback screen, which also renders PostFeedbackView with kind="CODE".
        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.kind).not.toBe('CODE')
    })

    it('renders the reviewer agreements gate when code is submitted but agreements are not acked', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await callPage(org.slug, study.id)

        renderWithProviders(page!)
        expect(screen.getByText('Study request')).toBeInTheDocument()
    })

    it('renders CodeReview when code is submitted and agreements are acked', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await ackReviewerAgreements(study.id)

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(CodeReview)
    })

    it('renders PostFeedbackView (CODE) once a code decision is recorded', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-APPROVED')

        const page = await callPage(org.slug, study.id)

        // Both feedback screens render PostFeedbackView; assert kind="CODE" so this can't pass via
        // the proposal-feedback variant (which would mean the code decision routed to the wrong screen).
        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.kind).toBe('CODE')
    })

    it('renders the outputs-pending screen once the approved code is executing (no results yet)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-APPROVED')
        await addJobStatus(study.id, 'JOB-READY')

        const page = await callPage(org.slug, study.id)

        // The executing window out-ranks the code-approved feedback screen.
        expect(page?.type).toBe(SecondaryAnalysisView)
    })

    it('renders StudyDetailsReviewer when results are present', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-APPROVED')
        await addJobStatus(study.id, 'FILES-APPROVED')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(StudyDetailsReviewer)
    })
})
