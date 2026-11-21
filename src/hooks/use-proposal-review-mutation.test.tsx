import { vi } from 'vitest'
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
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderHook,
    setTestStudyStatus,
    waitFor,
    waitForPendingMutations,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { useProposalReviewMutation } from './use-proposal-review-mutation'
import { refresh } from 'next/cache'

const validFeedback = buildFeedback(60)
const REVIEW_VERSION = 1

describe('useProposalReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('approve decision publishes its event from the server and navigates', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        const events = captureStudyEvents()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        // Status lands only once the action has resolved. isSubmitting is also true while the
        // request is in flight, so the lock has to still be on after that write.
        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('APPROVED')
            expect(result.current.isSubmitting).toBe(true)
        })

        expect(events.events).toHaveLength(1)
        // One event, the decision, from the action's transaction.
        expect(events.events[0]).toMatchObject({
            studyId: study.id,
            change: 'proposal-review-submitted',
            submittedBy: { name: expect.stringMatching(/.+/) },
            originTabId: tabSessionId,
        })
        expect(events.executors[0].isTransaction).toBe(true)

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ 'data-toast-kind': 'success', title: 'Decision submitted' }),
        )

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
        )
    })

    it.each([
        { decision: 'needs-clarification' as const, expectedStatus: 'CHANGE-REQUESTED' as const },
        { decision: 'reject' as const, expectedStatus: 'REJECTED' as const },
    ])('$decision decision publishes with the same wiring', async ({ decision, expectedStatus }) => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        const events = captureStudyEvents()
        const reviewUrl = Routes.studyReview({ orgSlug: org.slug, studyId: study.id })
        memoryRouter.setCurrentUrl(reviewUrl)
        const routerRefresh = (memoryRouter as unknown as { refresh: Mock }).refresh
        routerRefresh.mockClear()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({ decision, feedback: validFeedback })
        })
        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe(expectedStatus)
            expect(result.current.isSubmitting).toBe(true)
            expect(events.events).toHaveLength(1)
        })

        // One event, the decision, from the action's transaction.
        expect(events.events[0]).toMatchObject({
            studyId: study.id,
            change: 'proposal-review-submitted',
            submittedBy: { name: expect.stringMatching(/.+/) },
            originTabId: tabSessionId,
        })
        expect(events.executors[0].isTransaction).toBe(true)
        // The action re-renders the current route itself, so the client sends no second refresh.
        expect(vi.mocked(refresh)).toHaveBeenCalledTimes(1)
        expect(routerRefresh).not.toHaveBeenCalled()
    })

    it('action error: no navigation, no event', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        // Promoting out of PENDING-REVIEW forces the action's editable-status guard to reject.
        await setTestStudyStatus(study.id, 'APPROVED')
        const events = captureStudyEvents()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Decision could not be submitted',
        )
        expect(errorCall).toBeDefined()
        expect(errorCall![0]).toMatchObject({ message: 'Your work is saved. Try again.' })
        expect(events.events).toEqual([])
        expect(memoryRouter.asPath).toBe('/start')

        const after = await db.selectFrom('study').select('status').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.status).toBe('APPROVED')
    })

    it('fires the caller-supplied onError callback alongside the hook-level one', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await setTestStudyStatus(study.id, 'APPROVED')

        const callerOnError = vi.fn()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback }, { onError: callerOnError })
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        expect(callerOnError).toHaveBeenCalledTimes(1)
    })

    it('a double submit records one decision and shows no failure toast', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        const events = captureStudyEvents()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        // No render between the two calls, as with both clicks of a double-click.
        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitForPendingMutations()

        const feedbackEntries = await db
            .selectFrom('studyProposalComment')
            .select('id')
            .where('studyId', '=', study.id)
            .where('entryType', '=', 'REVIEWER-FEEDBACK')
            .execute()
        expect(feedbackEntries).toHaveLength(1)
        expect(notifications.show).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Decision could not be submitted' }),
        )
        expect(events.events).toHaveLength(1)
    })

    it('a failed submit lets the reviewer try again', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        await setTestStudyStatus(study.id, 'APPROVED')

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'reject', feedback: validFeedback })
        })
        await waitForPendingMutations()
        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Decision could not be submitted' }),
        )
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        await act(async () => {
            result.current.submitReview({ decision: 'reject', feedback: validFeedback })
        })
        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select('status')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('REJECTED')
        })
    })
})
