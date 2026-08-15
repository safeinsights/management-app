import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { act, afterEach, describe, expect, it, renderWithProviders, screen, vi, waitFor } from '@/tests/unit.helpers'
import { useYjsWebsocket, YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { CollaborativeEditor } from './collaborative-editor'

type FakeSocket = {
    status: 'connecting' | 'connected' | 'disconnected'
    __emit: (event: string, ...args: unknown[]) => void
}

// Short on purpose: the phase threshold is only scenery here, and sweeping the real 30s of fake
// time would fire every unrelated timer the editor stack has pending.
const RECONNECTING_THRESHOLD_MS = 10
const LAYOUT_SETTLING_MS = 400
const DOC_ID = 'review-feedback-01940000-0000-7000-8000-000000000001-v1'
const STUDY_ID = '01940000-0000-7000-8000-000000000001'
const ARIA_LABEL = 'Initial request review feedback'

// The editor takes the tab-singleton socket from context, the same way ReviewFeedbackSection does,
// so the connection-phase state machine drives this render.
function EditorHarness({ onBlur }: { onBlur: () => void }) {
    const websocketProvider = useYjsWebsocket()
    if (!websocketProvider) return null
    return (
        <CollaborativeEditor
            id={DOC_ID}
            studyId={STUDY_ID}
            websocketProvider={websocketProvider}
            inputId="review-feedback"
            ariaLabel={ARIA_LABEL}
            onBlur={onBlur}
        />
    )
}

const pressOutsideTheEditor = () => {
    act(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
}

/** Drops the socket for long enough that the offline banner renders, which moves the editor. */
const goOffline = () => {
    const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances.at(-1)!
    act(() => {
        socket.status = 'disconnected'
        socket.__emit('status', { status: 'disconnected' })
        vi.advanceTimersByTime(RECONNECTING_THRESHOLD_MS + 1)
    })
}

/**
 * OTTER-647: the offline banner is 85px of in-flow content above the editor, so showing or hiding
 * it moves the toolbar at the editor's bottom edge. A reviewer already reaching for a toolbar
 * button lands on the page instead, and that press used to read as leaving a required field empty.
 *
 * jsdom has no layout engine, so the movement itself cannot be measured here. What is testable is
 * the rule that makes the movement harmless: a press arriving while the editor's own layout is
 * still settling does not validate, and one arriving afterwards does.
 */
describe('CollaborativeEditor blur guard around connection changes', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    const renderAndEnterTheEditor = async (onBlur: () => void) => {
        renderWithProviders(
            <YjsWebsocketProvider reconnectingThresholdMs={RECONNECTING_THRESHOLD_MS}>
                <EditorHarness onBlur={onBlur} />
            </YjsWebsocketProvider>,
        )
        const surface = await waitFor(() => screen.getByLabelText(ARIA_LABEL))
        act(() => {
            surface.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
        })
        vi.useFakeTimers()
    }

    it('ignores a press that lands while the editor is still moving', async () => {
        const onBlur = vi.fn()
        await renderAndEnterTheEditor(onBlur)

        goOffline()
        pressOutsideTheEditor()

        expect(onBlur).not.toHaveBeenCalled()
    })

    it('validates a press once the layout has settled', async () => {
        const onBlur = vi.fn()
        await renderAndEnterTheEditor(onBlur)

        goOffline()
        act(() => {
            vi.advanceTimersByTime(LAYOUT_SETTLING_MS + 1)
        })
        pressOutsideTheEditor()

        expect(onBlur).toHaveBeenCalledTimes(1)
    })
})
