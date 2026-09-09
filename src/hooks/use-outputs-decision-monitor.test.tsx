import { useEffect, type FC } from 'react'
import { vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import * as RouterMock from 'next-router-mock'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { act, beforeEach, describe, expect, it, render, waitFor, type Mock } from '@/tests/unit.helpers'
import {
    OutputsReviewFeedbackProviderShare,
    usePublishOutputsReviewFeedbackProvider,
} from '@/lib/realtime/outputs-review-feedback-provider-context'
import { getOutputsDecisionStatusAction } from '@/server/actions/study-job.actions'
import type { OutputsDecisionStatus } from '@/lib/outputs-review'
import {
    OutputsDecisionCoordinationProvider,
    useOutputsDecisionCoordination,
} from '@/components/study/outputs-decision-coordination'
import { peerDecisionMessage } from './use-outputs-decision-monitor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryRouter = (RouterMock as any).memoryRouter as { asPath: string; setCurrentUrl: (url: string) => void }

vi.mock('@/server/actions/study-job.actions', () => ({
    getOutputsDecisionStatusAction: vi.fn(),
}))

const statusActionMock = getOutputsDecisionStatusAction as unknown as Mock
const showMock = notifications.show as unknown as Mock

const ORG = 'openstax'
const STUDY_ID = '019ddb2a-5f38-74ea-b401-94fd79839071'
const JOB_ID = '019ddb2a-5f38-74ea-b401-94fd798390ff'
const TAB_ID = 'tab-this'

const undecided: OutputsDecisionStatus = {
    decided: false,
    decision: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
}

const decidedBy = (name: string): OutputsDecisionStatus => ({
    decided: true,
    decision: 'share-outputs',
    decidedById: 'user-1',
    decidedByName: name,
    decidedAt: '2026-08-11T13:53:00.000Z',
})

type Coordination = ReturnType<typeof useOutputsDecisionCoordination>

const captured: { current: Coordination | null } = { current: null }
const coordination = () => {
    if (!captured.current) throw new Error('coordination context was not captured')
    return captured.current
}

// Publishing in an effect keeps render pure; the value is stable across renders anyway.
const Probe = () => {
    const value = useOutputsDecisionCoordination()
    useEffect(() => {
        captured.current = value
    }, [value])
    return null
}

type StatelessHandler = (event: { payload: unknown }) => void

// Only the stateless channel of a provider is needed here, and a real HocuspocusProvider would
// open a websocket.
const stubProvider = () => {
    const handlers = new Set<StatelessHandler>()
    const provider = {
        on: (name: string, handler: StatelessHandler) => {
            if (name === 'stateless') handlers.add(handler)
        },
        off: (name: string, handler: StatelessHandler) => {
            if (name === 'stateless') handlers.delete(handler)
        },
    } as unknown as HocuspocusProvider
    return { provider, emit: (payload: unknown) => handlers.forEach((handler) => handler({ payload })) }
}

const PublishProvider: FC<{ provider: HocuspocusProvider }> = ({ provider }) => {
    const publish = usePublishOutputsReviewFeedbackProvider()
    useEffect(() => publish(provider), [publish, provider])
    return null
}

const peerEvent = (overrides: Record<string, string> = {}) =>
    JSON.stringify({
        type: 'outputs-review-submitted',
        studyId: STUDY_ID,
        studyJobId: JOB_ID,
        submittedByTabId: 'tab-other',
        submittedByClerkId: 'user_other',
        submittedByName: 'Name From The Payload',
        ...overrides,
    })

const renderMonitor = ({ enabled = true, provider }: { enabled?: boolean; provider?: HocuspocusProvider } = {}) =>
    render(
        <OutputsReviewFeedbackProviderShare>
            <OutputsDecisionCoordinationProvider
                orgSlug={ORG}
                studyId={STUDY_ID}
                jobId={JOB_ID}
                tabSessionId={TAB_ID}
                enabled={enabled}
            >
                <Probe />
                {provider ? <PublishProvider provider={provider} /> : null}
            </OutputsDecisionCoordinationProvider>
        </OutputsReviewFeedbackProviderShare>,
    )

describe('useOutputsDecisionMonitor', () => {
    beforeEach(() => {
        captured.current = null
        memoryRouter.setCurrentUrl('/start')
    })

    it('leaves an undecided job alone', async () => {
        statusActionMock.mockResolvedValue(undecided)
        renderMonitor()

        await waitFor(() => expect(statusActionMock).toHaveBeenCalled())

        expect(showMock).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('names the decider from the database and moves the tab to the decided screen', async () => {
        statusActionMock.mockResolvedValue(decidedBy('Malar Natarajan'))
        renderMonitor()

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))

        expect(showMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Decision submitted',
                message: peerDecisionMessage('Malar Natarajan'),
            }),
        )
        expect(memoryRouter.asPath).toBe(`/${ORG}/study/${STUDY_ID}/review`)
    })

    it('tells only once even when several checks see the same decision', async () => {
        statusActionMock.mockResolvedValue(decidedBy('Malar Natarajan'))
        renderMonitor()

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        await act(async () => {
            await coordination().checkStatus()
            coordination().finalizeDecided(decidedBy('Malar Natarajan'))
        })

        expect(showMock).toHaveBeenCalledTimes(1)
    })

    // The tab that submitted has already navigated from its own success path, so a toast naming
    // itself would be noise. Every other tab is a peer, including one of the same user.
    it('suppresses the toast for the tab whose own submit succeeded, but still navigates', async () => {
        statusActionMock.mockResolvedValue(undecided)
        renderMonitor()
        await waitFor(() => expect(statusActionMock).toHaveBeenCalled())

        act(() => {
            coordination().setOwnSubmission('pending')
            coordination().setOwnSubmission('succeeded')
            coordination().finalizeDecided(decidedBy('Malar Natarajan'))
        })

        expect(showMock).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe(`/${ORG}/study/${STUDY_ID}/review`)
    })

    // A decision arriving mid-submit belongs to that attempt's own handler, which needs to
    // reconcile first. Losing it would leave the reviewer on a dead form.
    it('holds a decision seen while this tab is submitting, then applies it when the attempt ends', async () => {
        statusActionMock.mockResolvedValue(decidedBy('Malar Natarajan'))
        renderMonitor()
        act(() => coordination().setOwnSubmission('pending'))

        await waitFor(() => expect(statusActionMock).toHaveBeenCalled())
        expect(showMock).not.toHaveBeenCalled()

        act(() => coordination().setOwnSubmission('idle'))

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        expect(memoryRouter.asPath).toBe(`/${ORG}/study/${STUDY_ID}/review`)
    })

    it('does nothing at all when disabled', async () => {
        statusActionMock.mockResolvedValue(decidedBy('Malar Natarajan'))
        renderMonitor({ enabled: false })

        await waitFor(() => expect(showMock).not.toHaveBeenCalled())
        expect(statusActionMock).not.toHaveBeenCalled()
    })

    it('stays quiet when the status read fails', async () => {
        statusActionMock.mockResolvedValue({ error: 'nope' })
        renderMonitor()

        await waitFor(() => expect(statusActionMock).toHaveBeenCalled())

        expect(showMock).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })

    // The two triggers e2e cannot reach: it runs with SINGLE_USER_EDITING, so no provider is ever
    // published, and headless Chromium keeps every page visible.
    it('checks again when a peer broadcasts, and names the decider from the database', async () => {
        statusActionMock.mockResolvedValueOnce(undecided).mockResolvedValue(decidedBy('Malar Natarajan'))
        const { provider, emit } = stubProvider()
        renderMonitor({ provider })

        await waitFor(() => expect(statusActionMock).toHaveBeenCalledTimes(1))
        expect(showMock).not.toHaveBeenCalled()

        act(() => emit(peerEvent()))

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        expect(showMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: peerDecisionMessage('Malar Natarajan') }),
        )
    })

    it('ignores a broadcast from its own tab, and one for another job', async () => {
        statusActionMock.mockResolvedValueOnce(undecided).mockResolvedValue(decidedBy('Malar Natarajan'))
        const { provider, emit } = stubProvider()
        renderMonitor({ provider })

        await waitFor(() => expect(statusActionMock).toHaveBeenCalledTimes(1))

        act(() => {
            emit(peerEvent({ submittedByTabId: TAB_ID }))
            emit(peerEvent({ studyJobId: '019ddb2a-5f38-74ea-b401-94fd79839000' }))
            emit('not json at all')
        })

        expect(statusActionMock).toHaveBeenCalledTimes(1)
        expect(showMock).not.toHaveBeenCalled()
    })

    it('checks again when the tab becomes visible', async () => {
        statusActionMock.mockResolvedValueOnce(undecided).mockResolvedValue(decidedBy('Malar Natarajan'))
        renderMonitor()

        await waitFor(() => expect(statusActionMock).toHaveBeenCalledTimes(1))
        expect(showMock).not.toHaveBeenCalled()

        act(() => document.dispatchEvent(new Event('visibilitychange')))

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        expect(memoryRouter.asPath).toBe(`/${ORG}/study/${STUDY_ID}/review`)
    })
})
