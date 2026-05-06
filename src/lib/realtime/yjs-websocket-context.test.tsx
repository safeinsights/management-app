import { useEffect } from 'react'
import { vi } from 'vitest'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
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
    const providerCtorSpy = (HocuspocusProvider as unknown as { __ctor: Mock }).__ctor

    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        providerCtorSpy.mockClear()
        ;(HocuspocusProvider as unknown as { __instances: unknown[] }).__instances.length = 0
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

// Regression: see Bug 1 in the original report. ReviewSubmissionListener used
// to construct its own HocuspocusProvider for `review-feedback-${studyId}`,
// colliding with the editor's provider in HocuspocusProviderWebsocket.providerMap
// (the second `attach()` overwrites the first by name). The fix routes the
// listener through ReviewFeedbackProviderProvider so it consumes the editor's
// provider instead of constructing a second one.
//
// These tests exercise the publish/subscribe contract directly rather than the
// full review page mount — `next/dynamic`-loaded CollaborativeEditor + Lexical's
// own provider-factory effect don't reliably run inside a unit-test microtask
// window, so we test the seam the listener actually depends on.
describe('ReviewFeedbackProviderProvider', () => {
    it('subscribers receive the provider that the editor publishes', async () => {
        const ReviewFeedbackProviderProviderModule = await import('@/lib/realtime/review-feedback-provider-context')
        const { ReviewFeedbackProviderProvider, usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            ReviewFeedbackProviderProviderModule

        // Stand-in HocuspocusProvider — using the FakeHocuspocusProvider class would
        // require importing it through the mocked module, but we only care about
        // identity here, so a plain object is sufficient.
        const fakeProvider = { id: 'editor-provider' } as unknown as HocuspocusProvider

        let received: HocuspocusProvider | null = null
        const Editor = () => {
            const publish = usePublishReviewFeedbackProvider()
            useEffect(() => {
                publish(fakeProvider)
                return () => publish(null)
            }, [publish])
            return null
        }
        const Listener = () => {
            const provider = useReviewFeedbackProvider()
            useEffect(() => {
                received = provider
            }, [provider])
            return null
        }

        render(
            <ReviewFeedbackProviderProvider>
                <Listener />
                <Editor />
            </ReviewFeedbackProviderProvider>,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(received).toBe(fakeProvider)
    })

    it('subscribers see null after the editor unmounts (clears its publish)', async () => {
        const ReviewFeedbackProviderProviderModule = await import('@/lib/realtime/review-feedback-provider-context')
        const { ReviewFeedbackProviderProvider, usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            ReviewFeedbackProviderProviderModule

        const fakeProvider = { id: 'editor-provider' } as unknown as HocuspocusProvider

        let received: HocuspocusProvider | null = null
        const Editor = ({ mounted }: { mounted: boolean }) => {
            const publish = usePublishReviewFeedbackProvider()
            useEffect(() => {
                if (!mounted) return undefined
                publish(fakeProvider)
                return () => publish(null)
            }, [publish, mounted])
            return null
        }
        const Listener = () => {
            const provider = useReviewFeedbackProvider()
            useEffect(() => {
                received = provider
            }, [provider])
            return null
        }
        const Harness = ({ editorMounted }: { editorMounted: boolean }) => (
            <ReviewFeedbackProviderProvider>
                <Listener />
                <Editor mounted={editorMounted} />
            </ReviewFeedbackProviderProvider>
        )

        const { rerender } = render(<Harness editorMounted={true} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(received).toBe(fakeProvider)

        rerender(<Harness editorMounted={false} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(received).toBeNull()
    })
})

describe('bfcache restore', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    // Regression: see Bug 2 in the original report. `pagehide` destroys the
    // singleton; without a matching `pageshow` handler, React state retained
    // the destroyed reference and editors went silently dead after a back-button
    // bfcache restore. The fix is a `pageshow` handler that re-creates the
    // singleton and notifies live providers via socketSubscribers.
    it('re-creates the singleton and updates consumers when the page is restored from bfcache', () => {
        const sockets: Array<ReturnType<typeof useYjsWebsocket>> = []
        render(
            <YjsWebsocketProvider>
                <Probe onSocket={(s) => sockets.push(s)} />
            </YjsWebsocketProvider>,
        )
        const initial = sockets.at(-1)
        expect(initial).not.toBeNull()
        expect(ctorSpy).toHaveBeenCalledTimes(1)

        // Simulate the browser's bfcache: pagehide destroys, pageshow with
        // persisted=true must re-create.
        act(() => {
            window.dispatchEvent(new Event('pagehide'))
        })
        act(() => {
            // PageTransitionEvent isn't available in jsdom by default; fake it.
            const event = Object.assign(new Event('pageshow'), { persisted: true })
            window.dispatchEvent(event)
        })

        // A new HocuspocusProviderWebsocket was constructed, AND the consumer's
        // useState now points at it (rather than the destroyed original).
        expect(ctorSpy).toHaveBeenCalledTimes(2)
        const restored = sockets.at(-1)
        expect(restored).not.toBe(initial)
        expect(restored).not.toBeNull()
    })

    it('ignores ordinary pageshow events (persisted=false) so first-load does not double-construct', () => {
        render(
            <YjsWebsocketProvider>
                <Probe onSocket={() => {}} />
            </YjsWebsocketProvider>,
        )
        expect(ctorSpy).toHaveBeenCalledTimes(1)

        act(() => {
            const event = Object.assign(new Event('pageshow'), { persisted: false })
            window.dispatchEvent(event)
        })

        expect(ctorSpy).toHaveBeenCalledTimes(1)
    })
})
