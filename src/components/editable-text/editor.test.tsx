import { renderWithProviders, render, screen, describe, it, expect } from '@/tests/unit.helpers'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { theme } from '@/theme'
import { Editor } from './editor'

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

        // The single-user editor renders the editable surface synchronously; the
        // collaborative path would show a skeleton because websocketProvider is null.
        expect(await screen.findByLabelText('Feedback')).toBeDefined()
    })

    it('holds a skeleton in collaborative mode until the websocket exists', () => {
        // renderWithProviders wraps in YjsWebsocketProvider with single-user off.
        const { container } = renderWithProviders(
            <Editor id="doc-2" studyId="study-1" ariaLabel="Feedback" websocketProvider={null} />,
        )

        expect(container.querySelector('[aria-label="Feedback"]')).toBeNull()
    })
})
