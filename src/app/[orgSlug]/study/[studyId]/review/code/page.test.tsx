import type React from 'react'
import { describe, it, expect } from 'vitest'
import {
    db,
    faker,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { Routes } from '@/lib/routes'
import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { PostFeedbackView } from '../post-feedback-view'
import StudyReviewCodePage from './page'

// Append a job status strictly after the latest existing one so multi-status histories keep a stable order.
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

const callPage = async (orgSlug: string, studyId: string) =>
    (await StudyReviewCodePage({
        params: Promise.resolve({ orgSlug, studyId }),
    })) as React.ReactElement<Record<string, unknown>>

// A study with results: the read-only /review/code step is reachable and lands on the code-feedback screen.
const seedResultsStudy = async (orgSlug: string) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'enclave' })
    const { study } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'APPROVED',
        jobStatus: 'CODE-SUBMITTED',
    })
    await addJobStatus(study.id, 'CODE-APPROVED')
    await addJobStatus(study.id, 'FILES-APPROVED')
    return { org, study }
}

describe('StudyReviewCodePage', () => {
    it('renders the code-feedback screen with a Previous link to the reviewed proposal for a results study', async () => {
        const { org, study } = await seedResultsStudy('openstax')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.kind).toBe('CODE')
        expect(page?.props.previousHref).toBe(Routes.studyReviewProposal({ orgSlug: org.slug, studyId: study.id }))

        renderWithProviders(page!)
        expect(screen.getByTestId('post-feedback-previous')).toBeInTheDocument()
    })

    // OTTER-687: the DP outputs screen has no route of its own, so forward is bare /review and the
    // reviewer rule table decides what renders there.
    it('forwards to /review for a results study, whose /review resolves past the code step', async () => {
        const { org, study } = await seedResultsStudy('openstax')

        const page = await callPage(org.slug, study.id)

        expect(page?.props.nextStepHref).toBe(Routes.studyReview({ orgSlug: org.slug, studyId: study.id }))

        renderWithProviders(page!)
        expect(screen.getByTestId('cta-next-step')).toHaveTextContent('Next step')
        expect(screen.queryByTestId('go-to-dashboard')).not.toBeInTheDocument()
    })

    it('forwards to /review once the enclave is running the job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-APPROVED')
        await addJobStatus(study.id, 'JOB-RUNNING')

        const page = await callPage(org.slug, study.id)

        expect(page?.props.nextStepHref).toBe(Routes.studyReview({ orgSlug: org.slug, studyId: study.id }))
    })

    // Approved but not yet packaged: /review still resolves to this very screen, so a forward link
    // would only point at the page it sits on.
    it('offers no step forward while /review still resolves to the code step', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-APPROVED')

        const page = await callPage(org.slug, study.id)

        expect(page?.props.nextStepHref).toBeUndefined()

        renderWithProviders(page!)
        expect(screen.getByTestId('go-to-dashboard')).toBeInTheDocument()
        expect(screen.queryByTestId('cta-next-step')).not.toBeInTheDocument()
    })

    it('renders code-feedback with the Previous link for a decided-code study without results yet', async () => {
        // The route is reachable mid-flow (e.g. a reviewer navigating directly), not only after results.
        // A code decision with no results still resolves to reviewer-code-feedback and shows Previous.
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.kind).toBe('CODE')
        expect(page?.props.previousHref).toBe(Routes.studyReviewProposal({ orgSlug: org.slug, studyId: study.id }))
    })

    it('404s when the study has not reached the code stage (no forward jumps)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        await expect(callPage(org.slug, study.id)).rejects.toThrow()
    })

    it('denies a non-member, non-SI user (guard runs before the code step)', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })
        const otherOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { study } = await insertTestStudyJobData({ org: otherOrg, studyStatus: 'PENDING-REVIEW' })

        const page = await callPage(otherOrg.slug, study.id)

        expect(page?.type).not.toBe(PostFeedbackView)
        expect([AccessDeniedAlert, AlertNotFound]).toContain(page?.type)
    })
})
