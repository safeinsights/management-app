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

        expect(ctorSpy).toHaveBeenCalledTimes(1)
    })

    it('opens no websocket in single-user mode', () => {
        const sockets: Array<ReturnType<typeof useYjsWebsocket>> = []

        render(
            <YjsWebsocketProvider singleUserEditing>
                <Probe onSocket={(s) => sockets.push(s)} />
            </YjsWebsocketProvider>,
        )

        expect(ctorSpy).not.toHaveBeenCalled()
        expect(sockets.every((s) => s === null)).toBe(true)
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
        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
        })
        // Below threshold, so no flicker.
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

    it('opens exactly one websocket when listener and editor mount together', async () => {
        const { ReviewFeedbackProviderShare } = await import('@/lib/realtime/review-feedback-provider-context')
        const FeedbackHarness = () => {
            const feedback = useReviewFeedback()
            return (
                <ReviewFeedbackProviderShare>
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
                        reviewVersion={1}
                    />
                </ReviewFeedbackProviderShare>
            )
        }

        renderWithProviders(<FeedbackHarness />)

        expect(ctorSpy).toHaveBeenCalledTimes(1)
    })
})

// Exercises the publish/subscribe seam directly, as the dynamic-loaded editor does not mount
// reliably in a unit test.
describe('ReviewFeedbackProviderShare', () => {
    it('subscribers receive the provider that the editor publishes', async () => {
        const ReviewFeedbackProviderShareModule = await import('@/lib/realtime/review-feedback-provider-context')
        const { ReviewFeedbackProviderShare, usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            ReviewFeedbackProviderShareModule

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
            <ReviewFeedbackProviderShare>
                <Listener />
                <Editor />
            </ReviewFeedbackProviderShare>,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(received).toBe(fakeProvider)
    })

    it('subscribers see null after the editor unmounts (clears its publish)', async () => {
        const ReviewFeedbackProviderShareModule = await import('@/lib/realtime/review-feedback-provider-context')
        const { ReviewFeedbackProviderShare, usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            ReviewFeedbackProviderShareModule

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
            <ReviewFeedbackProviderShare>
                <Listener />
                <Editor mounted={editorMounted} />
            </ReviewFeedbackProviderShare>
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

    it('subscribers receive a fresh provider after the editor unmounts and remounts', async () => {
        const { ReviewFeedbackProviderShare, usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            await import('@/lib/realtime/review-feedback-provider-context')

        const firstProvider = { id: 'first' } as unknown as HocuspocusProvider
        const secondProvider = { id: 'second' } as unknown as HocuspocusProvider

        let received: HocuspocusProvider | null = null
        const Editor = ({ provider }: { provider: HocuspocusProvider | null }) => {
            const publish = usePublishReviewFeedbackProvider()
            useEffect(() => {
                if (!provider) return undefined
                publish(provider)
                return () => publish(null)
            }, [publish, provider])
            return null
        }
        const Listener = () => {
            const provider = useReviewFeedbackProvider()
            useEffect(() => {
                received = provider
            }, [provider])
            return null
        }
        const Harness = ({ provider }: { provider: HocuspocusProvider | null }) => (
            <ReviewFeedbackProviderShare>
                <Listener />
                <Editor provider={provider} />
            </ReviewFeedbackProviderShare>
        )

        const { rerender } = render(<Harness provider={firstProvider} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(received).toBe(firstProvider)

        rerender(<Harness provider={null} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(received).toBeNull()

        rerender(<Harness provider={secondProvider} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(received).toBe(secondProvider)
    })

    it('hooks throw when used outside ReviewFeedbackProviderShare so misconfiguration fails loudly', async () => {
        const { usePublishReviewFeedbackProvider, useReviewFeedbackProvider } =
            await import('@/lib/realtime/review-feedback-provider-context')

        const PublishProbe = () => {
            usePublishReviewFeedbackProvider()
            return null
        }
        const ReadProbe = () => {
            useReviewFeedbackProvider()
            return null
        }

        // React logs caught render errors to console.error; silenced to keep output clean.
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            expect(() => render(<PublishProbe />)).toThrow(/ReviewFeedbackProviderShare missing/)
            expect(() => render(<ReadProbe />)).toThrow(/ReviewFeedbackProviderShare missing/)
        } finally {
            consoleError.mockRestore()
        }
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

    // `pagehide` destroys the singleton, so without a `pageshow` handler React state keeps the
    // destroyed reference and editors go silently dead after a bfcache restore.
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

        act(() => {
            window.dispatchEvent(new Event('pagehide'))
        })
        act(() => {
            // PageTransitionEvent isn't available in jsdom.
            const event = Object.assign(new Event('pageshow'), { persisted: true })
            window.dispatchEvent(event)
        })

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
