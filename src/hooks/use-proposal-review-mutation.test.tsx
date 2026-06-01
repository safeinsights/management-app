import { vi } from 'vitest'
import {
    act,
    beforeEach,
    buildFeedback,
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
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { useEffect, type ReactNode } from 'react'
import {
    ReviewFeedbackProviderShare,
    usePublishReviewFeedbackProvider,
} from '@/lib/realtime/review-feedback-provider-context'
import { useProposalReviewMutation } from './use-proposal-review-mutation'

// Stub the editor's HocuspocusProvider. We publish this into the
// ReviewFeedbackProviderShare context to imitate what CollaborativeEditor's
// `onProviderReady` does in production. The mutation hook reads it via
// useReviewFeedbackProvider() and calls sendStateless on it.
type StubProvider = {
    sendStateless: ReturnType<typeof vi.fn>
}

function createStubProvider(): StubProvider {
    return { sendStateless: vi.fn() }
}

function PublishProvider({ provider }: { provider: StubProvider | null }) {
    const publish = usePublishReviewFeedbackProvider()
    useEffect(() => {
        publish(provider as unknown as Parameters<typeof publish>[0])
        return () => publish(null)
    }, [publish, provider])
    return null
}

function makeWrapper(provider: StubProvider | null) {
    const QueryWrapper = createTestQueryWrapper()
    // PublishProvider mounts AFTER children so the children's effects (the
    // hook's subscribe) run before PublishProvider's publish effect. Without
    // this ordering the publish notifies an empty subscriber set and the hook
    // ends up with editorProvider = null. In production the CollaborativeEditor
    // mounts dynamically much later than the surrounding tree, so the timing
    // is naturally correct.
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryWrapper>
                <ReviewFeedbackProviderShare>
                    {children}
                    <PublishProvider provider={provider} />
                </ReviewFeedbackProviderShare>
            </QueryWrapper>
        )
    }
}

const validFeedback = buildFeedback(60)
const REVIEW_VERSION = 1

describe('useProposalReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('approve decision broadcasts via the editor provider and navigates', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        const provider = createStubProvider()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: makeWrapper(provider) },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        const updated = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('APPROVED')

        expect(provider.sendStateless).toHaveBeenCalledTimes(1)
        const payload = JSON.parse(provider.sendStateless.mock.calls[0][0] as string)
        expect(payload.type).toBe('proposal-review-submitted')
        expect(payload.studyId).toBe(study.id)
        expect(payload.submittedByTabId).toBe(tabSessionId)
        expect(typeof payload.submittedByName).toBe('string')
        expect(payload.submittedByName.length).toBeGreaterThan(0)

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
        )
    })

    it.each([
        { decision: 'needs-clarification' as const, expectedStatus: 'CHANGE-REQUESTED' as const },
        { decision: 'reject' as const, expectedStatus: 'REJECTED' as const },
    ])('$decision decision broadcasts with the same wiring', async ({ decision, expectedStatus }) => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        const provider = createStubProvider()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: makeWrapper(provider) },
        )

        await act(async () => {
            result.current.submitReview({ decision, feedback: validFeedback })
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        const updated = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe(expectedStatus)

        expect(provider.sendStateless).toHaveBeenCalledTimes(1)
        const payload = JSON.parse(provider.sendStateless.mock.calls[0][0] as string)
        expect(payload.type).toBe('proposal-review-submitted')
        expect(payload.studyId).toBe(study.id)
        expect(payload.submittedByTabId).toBe(tabSessionId)
    })

    it('no editor provider published: navigates without broadcasting', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })

        // No provider in the share context, simulating the editor not having
        // mounted yet. The hook should gracefully skip broadcasting rather
        // than crash.
        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: makeWrapper(null) },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
        )
    })

    it('action error: no navigation, no broadcast', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        // Force the action's editable-status guard to reject by promoting the study
        // out of PENDING-REVIEW after fixtures are inserted.
        await setTestStudyStatus(study.id, 'APPROVED')
        const provider = createStubProvider()

        const { result } = renderHook(
            () =>
                useProposalReviewMutation({
                    studyId: study.id,
                    orgSlug: org.slug,
                    tabSessionId,
                    reviewVersion: REVIEW_VERSION,
                }),
            { wrapper: makeWrapper(provider) },
        )

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Failed to submit review',
        )
        expect(errorCall).toBeDefined()
        expect(provider.sendStateless).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')

        const after = await db.selectFrom('study').select('status').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.status).toBe('APPROVED')
    })
})
