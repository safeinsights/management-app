import { renderWithProviders, screen, act, waitFor, describe, it, expect, vi } from '@/tests/unit.helpers'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from 'lexical'
import { SingleUserEditor } from './single-user-editor'

function lexicalJson(text: string) {
    return JSON.stringify({
        root: {
            children: [
                {
                    children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    })
}

// jsdom cannot dispatch the beforeinput events Lexical relies on, so edits go through its API.
function CaptureEditor({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
    const [editor] = useLexicalComposerContext()
    onReady(editor)
    return null
}

describe('SingleUserEditor', () => {
    it('seeds the editor from initialValue', async () => {
        renderWithProviders(
            <SingleUserEditor id="doc-1" initialValue={lexicalJson('hello world')} ariaLabel="Feedback" />,
        )

        expect(await screen.findByText('hello world')).toBeDefined()
    })

    it('fires onChange with the serialized content when the document changes', async () => {
        const onChange = vi.fn()
        let editor: LexicalEditor | null = null
        renderWithProviders(
            <SingleUserEditor id="doc-2" ariaLabel="Feedback" onChange={onChange}>
                <CaptureEditor onReady={(e) => (editor = e)} />
            </SingleUserEditor>,
        )

        await waitFor(() => expect(editor).not.toBeNull())

        act(() => {
            editor!.update(() => {
                const paragraph = $createParagraphNode()
                paragraph.append($createTextNode('typed text'))
                $getRoot().clear().append(paragraph)
            })
        })

        await waitFor(() => expect(onChange).toHaveBeenCalled())
        const lastArg = onChange.mock.calls.at(-1)?.[0] as string
        expect(lastArg).toContain('typed text')
    })

    it('renders the footerRight content', async () => {
        renderWithProviders(
            <SingleUserEditor id="doc-3" ariaLabel="Feedback" footerRight={<span>0 / 100 words</span>} />,
        )

        expect(await screen.findByText('0 / 100 words')).toBeDefined()
    })

    it('renders footerLeft in the same footer row as footerRight (OTTER-674)', async () => {
        renderWithProviders(
            <SingleUserEditor
                id="doc-4"
                ariaLabel="Feedback"
                footerLeft={<span>This field is required.</span>}
                footerRight={<span>0 / 100 words</span>}
            />,
        )

        const left = await screen.findByText('This field is required.')
        expect(left.parentElement).toContainElement(screen.getByText('0 / 100 words'))
    })
})
