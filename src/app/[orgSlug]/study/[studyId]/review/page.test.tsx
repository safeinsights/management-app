import type React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { AlertNotFound } from '@/components/errors'
import StudyReviewPage from './page'
import { ProposalReviewView } from './proposal-review-view'
import { PostFeedbackView } from './post-feedback-view'
import { CodeReview } from './code-review'
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
