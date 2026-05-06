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
import { type HocuspocusProviderHandle } from '@/tests/hocuspocus.mock'
import { useProposalReviewMutation } from './use-proposal-review-mutation'

const featureFlagState = vi.hoisted(() => ({ enabled: false }))

vi.mock('@/components/openstax-feature-flag', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/openstax-feature-flag')>()
    return {
        ...actual,
        useProposalCollaborationFeatureFlag: () => featureFlagState.enabled,
    }
})

// Dynamic import inside the factory so the helper module is resolved at mock
// time, not at file-init. Using a top-level `import` left the binding in TDZ
// when vitest hoisted vi.mock above it, throwing "Cannot access __vi_import_N__
// before initialization" on CI.
vi.mock('@hocuspocus/provider', async () => {
    const { createHocuspocusMock } = await import('@/tests/hocuspocus.mock')
    return createHocuspocusMock()
})

import * as HocuspocusModule from '@hocuspocus/provider'

const constructed = (HocuspocusModule as unknown as { __constructed: HocuspocusProviderHandle[] }).__constructed

const validFeedback = buildFeedback(60)

describe('useProposalReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        constructed.length = 0
        featureFlagState.enabled = false
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('approve decision broadcasts and navigates when the flag is ON', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useProposalReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

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

        expect(handle.sendStateless).toHaveBeenCalledTimes(1)
        const payload = JSON.parse(handle.sendStateless.mock.calls[0][0] as string)
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
    ])('$decision decision broadcasts with the same wiring (flag ON)', async ({ decision, expectedStatus }) => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useProposalReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

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

        expect(handle.sendStateless).toHaveBeenCalledTimes(1)
        const payload = JSON.parse(handle.sendStateless.mock.calls[0][0] as string)
        expect(payload.type).toBe('proposal-review-submitted')
        expect(payload.studyId).toBe(study.id)
        expect(payload.submittedByTabId).toBe(tabSessionId)
    })

    it('flag OFF: navigates without broadcasting', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'unrelated-enclave', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })

        const { result } = renderHook(
            () => useProposalReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        // No provider constructed because the effect short-circuits when the flag is OFF.
        expect(constructed).toHaveLength(0)

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

        expect(constructed).toHaveLength(0)
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
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useProposalReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback })
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Failed to submit review',
        )
        expect(errorCall).toBeDefined()
        expect(handle.sendStateless).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')

        const after = await db.selectFrom('study').select('status').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.status).toBe('APPROVED')
    })
})
