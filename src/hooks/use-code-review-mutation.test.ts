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
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { type HocuspocusProviderHandle } from '@/tests/hocuspocus.mock'
import { useCodeReviewMutation } from './use-code-review-mutation'
import type { CodeReviewCriteria } from './use-code-review-evaluation-map'

const featureFlagState = vi.hoisted(() => ({ enabled: false }))

vi.mock('@/components/openstax-feature-flag', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/openstax-feature-flag')>()
    return {
        ...actual,
        useCodeReviewCollaborationFeatureFlag: () => featureFlagState.enabled,
    }
})

vi.mock('@hocuspocus/provider', async () => {
    const { createHocuspocusMock } = await import('@/tests/hocuspocus.mock')
    return createHocuspocusMock()
})

import * as HocuspocusModule from '@hocuspocus/provider'

const constructed = (HocuspocusModule as unknown as { __constructed: HocuspocusProviderHandle[] }).__constructed

const validFeedback = buildFeedback(60)
const validCriteria: CodeReviewCriteria = {
    proposalAlignment: 'yes',
    agreementCompliance: 'yes',
    securityChecks: 'not-sure',
    privacyProtection: 'yes',
}

const setApprovedStudyAndCodeSubmitted = async () => {
    const { user, org } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'PENDING-REVIEW',
        jobStatus: 'CODE-SUBMITTED',
    })
    await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()
    return { user, org, study, job }
}

describe('useCodeReviewMutation', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        constructed.length = 0
        featureFlagState.enabled = false
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('approve broadcasts code-review-submitted and redirects with ?from=code-review (flag ON)', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback, criteria: validCriteria })
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
        expect(payload.type).toBe('code-review-submitted')
        expect(payload.studyId).toBe(study.id)
        expect(payload.submittedByTabId).toBe(tabSessionId)
        expect(typeof payload.submittedByName).toBe('string')

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `${Routes.studyReview({ orgSlug: org.slug, studyId: study.id })}?from=code-review`,
            ),
        )
    })

    it('reject broadcasts and rejects the study', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

        await act(async () => {
            result.current.submitReview({ decision: 'reject', feedback: validFeedback, criteria: validCriteria })
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        const updated = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('REJECTED')
        expect(handle.sendStateless).toHaveBeenCalledTimes(1)
    })

    it('flag OFF: navigates with ?from=code-review without broadcasting', async () => {
        // Non-openstax slug so the feature flag stays off in the real predicate.
        const { user, org } = await mockSessionWithTestData({ orgSlug: 'unrelated-enclave', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        // No broadcast provider when flag is OFF.
        expect(constructed).toHaveLength(0)

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback, criteria: validCriteria })
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(constructed).toHaveLength(0)
        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `${Routes.studyReview({ orgSlug: org.slug, studyId: study.id })}?from=code-review`,
            ),
        )
    })

    it('action error: no navigation, no broadcast', async () => {
        const { org, study } = await setApprovedStudyAndCodeSubmitted()
        // Force the action's editable-state guard to reject.
        await db.updateTable('study').set({ status: 'APPROVED' }).where('id', '=', study.id).execute()
        featureFlagState.enabled = true

        const { result } = renderHook(
            () => useCodeReviewMutation({ studyId: study.id, orgSlug: org.slug, tabSessionId }),
            { wrapper: createTestQueryWrapper() },
        )

        await waitFor(() => expect(constructed).toHaveLength(1))
        const handle = constructed[0]

        await act(async () => {
            result.current.submitReview({ decision: 'approve', feedback: validFeedback, criteria: validCriteria })
        })
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Failed to submit code review',
        )
        expect(errorCall).toBeDefined()
        expect(handle.sendStateless).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })
})
