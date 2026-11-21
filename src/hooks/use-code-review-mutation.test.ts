import {
    act,
    beforeEach,
    buildFeedback,
    captureStudyEvents,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    faker,
    insertTestJobStatus,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderHook,
    waitFor,
    waitForPendingMutations,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { useCodeReviewMutation, type SubmitCodeReviewArgs } from './use-code-review-mutation'
import type { CodeReviewCriteria } from './use-code-review-evaluation-map'

const validFeedback = buildFeedback(60)
const validCriteria: CodeReviewCriteria = {
    proposalAlignment: 'yes',
    agreementCompliance: 'yes',
    privacyProtection: 'yes',
}

const approval: SubmitCodeReviewArgs = { decision: 'approve', feedback: validFeedback, criteria: validCriteria }

const setApprovedStudyAndCodeSubmitted = async () => {
    const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'APPROVED',
        jobStatus: 'CODE-SUBMITTED',
    })
    await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()
    return { user, org, study, job }
}

describe('useCodeReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('approve publishes code-review-submitted and redirects to the code step', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()
        const events = captureStudyEvents()

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview(approval)
        })
        // The lock has to still be on once the action has resolved.
        await waitFor(() => {
            expect(events.events).toHaveLength(1)
            expect(result.current.isSubmitting).toBe(true)
        })
        const approved = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'CODE-APPROVED')
            .executeTakeFirst()
        expect(approved).toBeDefined()

        // One event, the decision, from the action's transaction; its own transitions stay quiet.
        expect(events.events[0]).toMatchObject({
            studyId: study.id,
            jobId: job.id,
            change: 'code-review-submitted',
            submittedBy: { name: expect.stringMatching(/.+/) },
            originTabId: tabSessionId,
        })
        expect(events.executors[0].isTransaction).toBe(true)

        // Bare /review resolves an approved study forward to the outputs step.
        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyReviewCode({ orgSlug: org.slug, studyId: study.id })),
        )
    })

    it('needs-clarification publishes one event and requests code changes, leaving the proposal approved', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()
        const events = captureStudyEvents()

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({
                decision: 'needs-clarification',
                feedback: validFeedback,
                criteria: validCriteria,
            })
        })
        await waitFor(() => {
            expect(events.events).toHaveLength(1)
            expect(result.current.isSubmitting).toBe(true)
        })

        const jobChangesRequested = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'CODE-CHANGES-REQUESTED')
            .executeTakeFirst()
        expect(jobChangesRequested).toBeTruthy()
        const updated = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('APPROVED')
    })

    it('action error: no navigation, no event', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()
        const events = captureStudyEvents()
        // Eligibility keys on job status alone (OTTER-552), so recording a decision makes the
        // latest code change a decision rather than a submission, which the claim rejects.
        await insertTestJobStatus(job.id, 'CODE-APPROVED', { userId: study.researcherId })

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview(approval)
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Decision could not be submitted',
        )
        expect(errorCall).toBeDefined()
        // A refusal reaches the reviewer verbatim, so it must not arrive wearing an "Error:" prefix.
        expect((errorCall?.[0] as { message?: string }).message).not.toMatch(/^Error:/)
        expect(events.events).toEqual([])
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('a double submit records one decision and shows no failure toast', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()
        const events = captureStudyEvents()

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        // No render between the two calls, as with both clicks of a double-click.
        await act(async () => {
            result.current.submitReview(approval)
            result.current.submitReview(approval)
        })
        await waitForPendingMutations()

        const decisions = await db
            .selectFrom('studyReviewComment')
            .select('id')
            .where('studyId', '=', study.id)
            .where('entryType', '=', 'DECISION')
            .execute()
        expect(decisions).toHaveLength(1)
        expect(notifications.show).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Decision could not be submitted' }),
        )
        expect(events.events).toHaveLength(1)
    })

    it('a failed submit lets the reviewer try again', async () => {
        const { org, study, job } = await setApprovedStudyAndCodeSubmitted()
        await insertTestJobStatus(job.id, 'CODE-APPROVED', { userId: study.researcherId })

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview(approval)
        })
        await waitForPendingMutations()
        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Decision could not be submitted' }),
        )
        // Reopens the code for review, so the same decision now goes through.
        await insertTestJobStatus(job.id, 'CODE-SUBMITTED')

        await act(async () => {
            result.current.submitReview(approval)
        })
        await waitFor(() =>
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision submitted' })),
        )
    })
})
