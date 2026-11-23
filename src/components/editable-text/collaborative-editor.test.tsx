import {
    act,
    advanceTimers,
    afterEach,
    describe,
    expect,
    fakeTimeouts,
    it,
    renderWithProviders,
    restoreRealTimers,
    screen,
    vi,
    type Mock,
} from '@/tests/unit.helpers'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { CollaborativeEditor } from './collaborative-editor'

type FakeProvider = { isAuthenticated: boolean; sendToken: Mock; startSync: Mock }
type ProviderOptions = { onAuthenticationFailed: (data: { reason: string }) => void }

const INFRA_FAILURE = 'INFRA_UNAVAILABLE: database unreachable'
const OFFLINE_BANNER = 'Working offline'
const RETRY_DELAY_MS = 5000

const Harness = () => {
    const socket = useYjsWebsocket()
    if (!socket) return null
    return <CollaborativeEditor id="doc-1" studyId="study-1" ariaLabel="Notes" websocketProvider={socket} />
}

// The provider the editor built, and a way to reject its handshake as the editor service would.
const renderEditor = async () => {
    renderWithProviders(<Harness />)
    await screen.findByLabelText('Notes')

    const { __instances, __ctor } = HocuspocusProvider as unknown as { __instances: FakeProvider[]; __ctor: Mock }
    const provider = __instances.at(-1)
    const options = __ctor.mock.calls.at(-1)?.[0] as ProviderOptions | undefined
    if (!provider || !options) throw new Error('the editor did not create a HocuspocusProvider')

    const rejectHandshake = (reason: string) => act(() => options.onAuthenticationFailed({ reason }))
    return { provider, rejectHandshake }
}

describe('CollaborativeEditor after the editor service is briefly unavailable', () => {
    afterEach(restoreRealTimers)

    it('resends the handshake once the service has had time to recover', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        fakeTimeouts()
        const { provider, rejectHandshake } = await renderEditor()

        rejectHandshake(INFRA_FAILURE)

        expect(screen.getByText(OFFLINE_BANNER)).toBeInTheDocument()
        expect(provider.sendToken).not.toHaveBeenCalled()

        await advanceTimers(RETRY_DELAY_MS)

        expect(provider.sendToken).toHaveBeenCalledOnce()
        expect(provider.startSync).toHaveBeenCalledOnce()
        expect(provider.sendToken.mock.invocationCallOrder[0]).toBeLessThan(
            provider.startSync.mock.invocationCallOrder[0],
        )
        expect(screen.queryByText(OFFLINE_BANNER)).not.toBeInTheDocument()
    })

    it('leaves the provider alone when it authenticated while the retry was waiting', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        fakeTimeouts()
        const { provider, rejectHandshake } = await renderEditor()

        rejectHandshake(INFRA_FAILURE)
        provider.isAuthenticated = true
        await advanceTimers(RETRY_DELAY_MS)

        expect(provider.sendToken).not.toHaveBeenCalled()
        expect(provider.startSync).not.toHaveBeenCalled()
    })
})
