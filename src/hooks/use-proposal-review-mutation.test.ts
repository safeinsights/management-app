import { vi } from 'vitest'
import {
    act,
    afterEach,
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
    resetSpyMode,
    setSpyMode,
    setTestStudyStatus,
    spyModeState,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { useProposalReviewMutation } from './use-proposal-review-mutation'

vi.mock('@/components/spy-mode-context', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/spy-mode-context')>()
    return {
        ...actual,
        useSpyMode: () => ({ isSpyMode: spyModeState.isSpyMode, toggleSpyMode: vi.fn() }),
    }
})

type Listener = (...args: unknown[]) => void

type ProviderHandle = {
    sendStateless: ReturnType<typeof vi.fn>
}

vi.mock('@hocuspocus/provider', () => {
    const constructed: ProviderHandle[] = []

    class HocuspocusProvider {
        sendStateless = vi.fn()
        private syncListeners: Listener[] = []

        constructor() {
            constructed.push({ sendStateless: this.sendStateless })
        }
        attach() {}
        on(event: string, fn: Listener) {
            if (event === 'synced') this.syncListeners.push(fn)
        }
        off(event: string, fn: Listener) {
            if (event === 'synced') this.syncListeners = this.syncListeners.filter((l) => l !== fn)
        }
        destroy() {}
    }

    class HocuspocusProviderWebsocket {
        constructor(_opts?: unknown) {}
        destroy() {}
    }

    return {
        HocuspocusProvider,
        HocuspocusProviderWebsocket,
        __constructed: constructed,
    }
})

import * as HocuspocusModule from '@hocuspocus/provider'

const constructed = (HocuspocusModule as unknown as { __constructed: ProviderHandle[] }).__constructed

const validFeedback = buildFeedback(60)

describe('useProposalReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        constructed.length = 0
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    afterEach(() => {
        resetSpyMode()
    })

    it('approve decision broadcasts and navigates when the flag is ON', async () => {
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        setSpyMode(true)

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
        setSpyMode(true)

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
        setSpyMode(true)

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
