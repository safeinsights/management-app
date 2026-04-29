import { describe, it, expect, beforeEach, renderHook, faker, type Mock } from '@/tests/unit.helpers'
import { Doc } from 'yjs'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'

import { SUBMISSION_SENTINEL_KEY, useSubmissionRedirectListener } from './use-submission-redirect-listener'

type Listener = (data: { payload: unknown }) => void

// Minimal Hocuspocus-like provider stand-in for the listener hook. Only implements
// the surface the hook actually touches: `on('stateless', ...)`, `off`, and `document`.
function createFakeProvider(doc: Doc) {
    const listeners = new Set<Listener>()
    return {
        document: doc,
        on(event: string, listener: Listener) {
            if (event === 'stateless') listeners.add(listener)
        },
        off(event: string, listener: Listener) {
            if (event === 'stateless') listeners.delete(listener)
        },
        emitStateless(payload: unknown) {
            for (const l of listeners) l({ payload })
        },
    }
}

const ORG_SLUG = 'test-org'

describe('useSubmissionRedirectListener', () => {
    let studyId: string
    let currentTabId: string
    let otherTabId: string
    let doc: Doc
    let provider: ReturnType<typeof createFakeProvider>

    beforeEach(() => {
        studyId = faker.string.uuid()
        currentTabId = faker.string.uuid()
        otherTabId = faker.string.uuid()
        doc = new Doc()
        provider = createFakeProvider(doc)
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    const mountListener = () =>
        renderHook(() =>
            useSubmissionRedirectListener({
                provider: provider as unknown as Parameters<typeof useSubmissionRedirectListener>[0]['provider'],
                orgSlug: ORG_SLUG,
                studyId,
                currentTabId,
                enabled: true,
            }),
        )

    it("skips the broadcaster's own tab", () => {
        mountListener()
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: currentTabId,
                submittedByName: 'Alice',
                orgName: 'Atlas DO',
            }),
        )
        expect(notifications.show).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('fires kick-out for a same-user other tab on proposal-submitted', () => {
        mountListener()
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: otherTabId,
                submittedByName: 'Alice',
                orgName: 'Atlas DO',
            }),
        )
        expect(notifications.show).toHaveBeenCalledTimes(1)
        const arg = (notifications.show as Mock).mock.calls[0][0]
        expect(arg.message).toBe(
            'Alice has proceeded to submit this study proposal to Atlas DO. No further edits are allowed at this point.',
        )
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/submitted`)
    })

    it('fires kick-out for a same-user other tab on proposal-review-submitted', () => {
        mountListener()
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-review-submitted',
                studyId,
                submittedByTabId: otherTabId,
                submittedByName: 'Bob',
            }),
        )
        expect(notifications.show).toHaveBeenCalledTimes(1)
        const arg = (notifications.show as Mock).mock.calls[0][0]
        expect(arg.message).toBe(
            'Bob has proceeded to submit a decision on this study proposal. No further edits are allowed at this point.',
        )
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/review`)
    })

    it('is idempotent: two stateless events trigger one navigation', () => {
        mountListener()
        const event = JSON.stringify({
            type: 'proposal-submitted',
            studyId,
            submittedByTabId: otherTabId,
            submittedByName: 'Alice',
            orgName: 'Atlas DO',
        })
        provider.emitStateless(event)
        provider.emitStateless(event)
        expect(notifications.show).toHaveBeenCalledTimes(1)
    })

    it('picks up the Y.Map sentinel (Layer 2) on first render', () => {
        const sentinelMap = doc.getMap(SUBMISSION_SENTINEL_KEY)
        sentinelMap.set(SUBMISSION_SENTINEL_KEY, {
            type: 'proposal-submitted',
            studyId,
            submittedByTabId: otherTabId,
            submittedByName: 'Alice',
            orgName: 'Atlas DO',
        })

        mountListener()

        expect(notifications.show).toHaveBeenCalledTimes(1)
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/submitted`)
    })

    it('picks up a late-arriving Y.Map sentinel via observe', () => {
        mountListener()

        // No sentinel yet → no nav.
        expect(memoryRouter.asPath).toBe('/start')

        const sentinelMap = doc.getMap(SUBMISSION_SENTINEL_KEY)
        sentinelMap.set(SUBMISSION_SENTINEL_KEY, {
            type: 'proposal-review-submitted',
            studyId,
            submittedByTabId: otherTabId,
            submittedByName: 'Bob',
        })

        expect(notifications.show).toHaveBeenCalledTimes(1)
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/review`)
    })

    it('ignores events for a different studyId', () => {
        mountListener()
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-submitted',
                studyId: faker.string.uuid(),
                submittedByTabId: otherTabId,
                submittedByName: 'Alice',
                orgName: 'Atlas DO',
            }),
        )
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('ignores malformed payloads', () => {
        mountListener()

        // Invalid JSON.
        provider.emitStateless('{not json')
        // Missing tabId.
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-submitted',
                studyId,
                submittedByName: 'Alice',
                orgName: 'Atlas DO',
            }),
        )
        // Unknown type.
        provider.emitStateless(
            JSON.stringify({
                type: 'something-else',
                studyId,
                submittedByTabId: otherTabId,
                submittedByName: 'Alice',
            }),
        )

        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('no-ops when disabled', () => {
        renderHook(() =>
            useSubmissionRedirectListener({
                provider: provider as unknown as Parameters<typeof useSubmissionRedirectListener>[0]['provider'],
                orgSlug: ORG_SLUG,
                studyId,
                currentTabId,
                enabled: false,
            }),
        )
        provider.emitStateless(
            JSON.stringify({
                type: 'proposal-submitted',
                studyId,
                submittedByTabId: otherTabId,
                submittedByName: 'Alice',
                orgName: 'Atlas DO',
            }),
        )
        expect(notifications.show).not.toHaveBeenCalled()
    })
})
