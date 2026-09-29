import { renderWithProviders, screen, act, waitFor, userEvent, describe, it, expect } from '@/tests/unit.helpers'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $isElementNode, $isTextNode, type LexicalEditor } from 'lexical'
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

async function renderEditorWithText(id: string, text: string) {
    let editor: LexicalEditor | null = null
    const { container } = renderWithProviders(
        <SingleUserEditor id={id} initialValue={lexicalJson(text)} ariaLabel="Feedback">
            <CaptureEditor onReady={(e) => (editor = e)} />
        </SingleUserEditor>,
    )

    await waitFor(() => expect(editor).not.toBeNull())
    return { container, editor: editor! }
}

// The toolbar reads the selection from editor state, not the DOM, so this stands in for a drag.
function selectAllText(editor: LexicalEditor) {
    act(() => {
        editor.update(() => {
            const paragraph = $getRoot().getFirstChild()
            if (!$isElementNode(paragraph)) return
            const textNode = paragraph.getFirstChild()
            if (!$isTextNode(textNode)) return
            textNode.select(0, textNode.getTextContentSize())
        })
    })
}

async function insertLinkViaToolbar(url: string) {
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Link'))
    const input = await screen.findByPlaceholderText('https://')
    await user.clear(input)
    await user.type(input, url)
    await user.click(screen.getByLabelText('Apply link'))
}

describe('Toolbar link insertion', () => {
    it('marks links to open in a new tab without leaking the referrer', async () => {
        const { container, editor } = await renderEditorWithText('toolbar-1', 'hello world')
        selectAllText(editor)

        await insertLinkViaToolbar('https://example.com')

        await waitFor(() => expect(container.querySelector('a')).not.toBeNull())
        const anchor = container.querySelector('a')!
        expect(anchor.getAttribute('href')).toBe('https://example.com')
        expect(anchor.getAttribute('target')).toBe('_blank')
        expect(anchor.getAttribute('rel')).toContain('noopener')
    })

    it('does not create a link for a URL that fails validation', async () => {
        const { container, editor } = await renderEditorWithText('toolbar-2', 'hello world')
        selectAllText(editor)

        await insertLinkViaToolbar('javascript:alert(1)')

        // The link editor closing is the signal that submitLink ran.
        await waitFor(() => expect(screen.queryByPlaceholderText('https://')).toBeNull())
        expect(container.querySelector('a')).toBeNull()
    })
})
