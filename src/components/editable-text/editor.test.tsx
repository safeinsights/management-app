import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, render, screen } from '@/tests/unit.helpers'
import { MantineProvider } from '@mantine/core'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { ModalsProvider } from '@mantine/modals'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { theme } from '@/theme'
import { Editor } from './editor'

const editorChunk = vi.hoisted(() => {
    let release = () => {}
    const loaded = new Promise<void>((resolve) => {
        release = resolve
    })
    return { loaded, release: () => release() }
})

// Holds the lazy chunk open, as a slow network or a loaded CI runner does.
vi.mock('./collaborative-editor', async (importOriginal) => {
    await editorChunk.loaded
    return importOriginal()
})

describe('Editor', () => {
    it('renders the single-user editor in single-user mode, without a websocket', async () => {
        render(
            <MantineProvider theme={theme}>
                <YjsWebsocketProvider singleUserEditing>
                    <ModalsProvider>
                        <Editor id="doc-1" studyId="study-1" ariaLabel="Feedback" websocketProvider={null} />
                    </ModalsProvider>
                </YjsWebsocketProvider>
            </MantineProvider>,
        )

        expect(await screen.findByLabelText('Feedback')).toBeDefined()
    })

    it('holds a skeleton in collaborative mode until the websocket exists', () => {
        const { container } = renderWithProviders(
            <Editor id="doc-2" studyId="study-1" ariaLabel="Feedback" websocketProvider={null} />,
        )

        expect(container.querySelector('[aria-label="Feedback"]')).toBeNull()
    })

    it('keeps the error in the footer while the collaborative editor loads', async () => {
        renderWithProviders(
            <Editor
                id="doc-3"
                studyId="study-1"
                ariaLabel="Feedback"
                websocketProvider={new HocuspocusProviderWebsocket({ url: 'ws://test' })}
                footerLeft="Enter your feedback before continuing."
            />,
        )

        expect(screen.getByText('Enter your feedback before continuing.')).toBeInTheDocument()
        expect(screen.queryByLabelText('Feedback')).toBeNull()

        editorChunk.release()

        expect(await screen.findByLabelText('Feedback')).toBeInTheDocument()
        expect(screen.getByText('Enter your feedback before continuing.')).toBeInTheDocument()
    })
})
