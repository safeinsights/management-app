import { useEffect } from 'react'
import { vi } from 'vitest'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import {
    act,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    render,
    renderWithProviders,
    type Mock,
} from '@/tests/unit.helpers'
import { ReviewFeedbackSection } from '@/app/[orgSlug]/study/[studyId]/review/review-feedback-section'
import { ReviewSubmissionListener } from '@/app/[orgSlug]/study/[studyId]/review/review-submission-listener'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import {
    YjsWebsocketProvider,
    useConnectionPhase,
    useYjsWebsocket,
    __resetSharedYjsWebsocketForTests,
} from './yjs-websocket-context'

type FakeSocket = {
    status: 'connecting' | 'connected' | 'disconnected'
    __emit: (event: string, ...args: unknown[]) => void
}

vi.mock('@/server/actions/editor.actions', () => ({
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
    getStudyStatusAction: vi.fn(() => Promise.resolve({ status: 'PENDING-REVIEW' })),
}))

// The mock class exposes its constructor spy at __ctor (see tests/vitest.setup.ts).
const ctorSpy = (HocuspocusProviderWebsocket as unknown as { __ctor: Mock }).__ctor

const Probe = ({ onSocket }: { onSocket: (socket: ReturnType<typeof useYjsWebsocket>) => void }) => {
    const socket = useYjsWebsocket()
    useEffect(() => {
        onSocket(socket)
    }, [socket, onSocket])
    return null
}

describe('YjsWebsocketProvider', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('creates exactly one HocuspocusProviderWebsocket regardless of consumer count', () => {
        const sockets: Array<ReturnType<typeof useYjsWebsocket>> = []

        render(
            <YjsWebsocketProvider>
                <Probe onSocket={(s) => sockets.push(s)} />
                <Probe onSocket={(s) => sockets.push(s)} />
                <Probe onSocket={(s) => sockets.push(s)} />
            </YjsWebsocketProvider>,
        )

        expect(ctorSpy).toHaveBeenCalledTimes(1)
        const unique = new Set(sockets.filter((s) => s !== null))
        expect(unique.size).toBe(1)
    })

    it('reuses the same socket across remount of the provider', () => {
        const first = render(
            <YjsWebsocketProvider>
                <Probe onSocket={() => {}} />
            </YjsWebsocketProvider>,
        )
        first.unmount()

        render(
            <YjsWebsocketProvider>
                <Probe onSocket={() => {}} />
            </YjsWebsocketProvider>,
        )

        // Module-scoped cache means a remount of the React provider tree does not
        // open a second TCP connection within the same tab.
        expect(ctorSpy).toHaveBeenCalledTimes(1)
    })
})

describe('useConnectionPhase', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        __resetSharedYjsWebsocketForTests()
    })

    const PhaseProbe = ({ onPhase }: { onPhase: (phase: string) => void }) => {
        const phase = useConnectionPhase()
        useEffect(() => {
            onPhase(phase)
        }, [phase, onPhase])
        return null
    }

    const mountWithThresholds = (onPhase: (phase: string) => void) => {
        return render(
            <YjsWebsocketProvider reconnectingThresholdMs={100} failureThresholdMs={500}>
                <PhaseProbe onPhase={onPhase} />
            </YjsWebsocketProvider>,
        )
    }

    it('starts connected when the socket is already connected at mount', () => {
        const phases: string[] = []
        mountWithThresholds((p) => phases.push(p))
        expect(phases.at(-1)).toBe('connected')
    })

    it('flips to reconnecting after a sustained disconnect post-connect', () => {
        const phases: string[] = []
        mountWithThresholds((p) => phases.push(p))
        const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances[0]
        // Simulate the socket dropping after a successful connect.
        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
        })
        // Below threshold — still connected from the user's POV (no flicker).
        act(() => {
            vi.advanceTimersByTime(99)
        })
        expect(phases.at(-1)).toBe('connected')
        act(() => {
            vi.advanceTimersByTime(2)
        })
        expect(phases.at(-1)).toBe('reconnecting')
    })

    it('flips to failed once the failure threshold passes', () => {
        const phases: string[] = []
        mountWithThresholds((p) => phases.push(p))
        const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances[0]
        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
        })
        act(() => {
            vi.advanceTimersByTime(500)
        })
        expect(phases.at(-1)).toBe('failed')
    })

    it('returns to connected on a successful reconnect and clears timers', () => {
        const phases: string[] = []
        mountWithThresholds((p) => phases.push(p))
        const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances[0]

        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
            vi.advanceTimersByTime(150)
        })
        expect(phases.at(-1)).toBe('reconnecting')

        act(() => {
            socket.status = 'connected'
            socket.__emit('status', { status: 'connected' })
        })
        expect(phases.at(-1)).toBe('connected')

        // Timers were cleared, so advancing past the failure threshold doesn't flip back.
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(phases.at(-1)).toBe('connected')
    })
})

describe('review page multiplexing', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('opens exactly one websocket when listener and editor mount together', () => {
        const FeedbackHarness = () => {
            const feedback = useReviewFeedback()
            return (
                <>
                    <ReviewSubmissionListener
                        orgSlug="data-org"
                        studyId="00000000-0000-0000-0000-000000000001"
                        tabSessionId="tab-1"
                        enabled
                    />
                    <ReviewFeedbackSection
                        feedback={feedback}
                        submittingLabName="Test Lab"
                        studyId="00000000-0000-0000-0000-000000000001"
                    />
                </>
            )
        }

        // renderWithProviders mounts YjsWebsocketProvider; both the listener and the
        // feedback editor consume the same singleton, so we expect a single TCP
        // connection even though the page has two separate Yjs documents in flight.
        renderWithProviders(<FeedbackHarness />)

        expect(ctorSpy).toHaveBeenCalledTimes(1)
    })
})
