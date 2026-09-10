import {
    renderWithProviders,
    screen,
    act,
    waitFor,
    userEvent,
    describe,
    it,
    expect,
    vi,
    fireEvent,
    within,
    mockSessionWithTestData,
    insertTestStudyData,
} from '@/tests/unit.helpers'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $isElementNode, $isTextNode, type LexicalEditor } from 'lexical'
import { LINK_CARD_LABELS, LINK_CARD_DIALOG_LABEL, INVALID_URL_MESSAGE } from '@/components/link-hover-card/copy'
import { displayOrgName } from '@/lib/string'
import { SingleUserEditor } from './single-user-editor'

const URL = 'https://example.com/prior-study'
const LINK_TEXT = 'prior study writeup'
const TAIL_TEXT = ' and more'

function textNode(text: string) {
    return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

/** A paragraph holding one link plus trailing plain text, so the caret has somewhere else to go. */
function linkedJson({ target, url }: { target: string | null; url: string }) {
    return JSON.stringify({
        root: {
            children: [
                {
                    children: [
                        {
                            children: [textNode(LINK_TEXT)],
                            direction: 'ltr',
                            format: '',
                            indent: 0,
                            type: 'link',
                            version: 1,
                            rel: target ? 'noopener noreferrer' : null,
                            target,
                            title: null,
                            url,
                        },
                        textNode(TAIL_TEXT),
                    ],
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

async function renderLinkedEditor(id: string, target: string | null = '_blank', url: string = URL) {
    let editor: LexicalEditor | null = null
    const { container } = renderWithProviders(
        <SingleUserEditor id={id} initialValue={linkedJson({ target, url })} ariaLabel="Feedback">
            <CaptureEditor onReady={(e) => (editor = e)} />
        </SingleUserEditor>,
    )

    await waitFor(() => expect(container.querySelector('a')).not.toBeNull())
    return { container, editor: editor! as LexicalEditor, anchor: container.querySelector('a')! }
}

// Moving the caret means the field has focus, which is also what the card's close rule looks for.
function selectInside(editor: LexicalEditor, where: 'link' | 'tail') {
    act(() => {
        editor.getRootElement()?.focus()
        editor.update(() => {
            const paragraph = $getRoot().getFirstChild()
            if (!$isElementNode(paragraph)) return

            const [link, tail] = paragraph.getChildren()
            const host = where === 'link' ? link : tail
            const target = $isElementNode(host) ? host.getFirstChild() : host
            if (!$isTextNode(target)) return
            target.select(1, 1)
        })
    })
}

const openCard = (anchor: HTMLElement) => fireEvent.click(anchor)

const findCard = () => screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

describe('LinkHoverCardPlugin', () => {
    it('opens the card on a click in link text, with focus on the first action', async () => {
        const { anchor } = await renderLinkedEditor('card-open')

        openCard(anchor)

        const card = await findCard()
        expect(card).toHaveTextContent(URL)
        await waitFor(() =>
            expect(document.activeElement).toBe(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })),
        )
    })

    it('marks the link as the open card trigger', async () => {
        const { anchor } = await renderLinkedEditor('card-aria')

        openCard(anchor)
        const card = await findCard()

        expect(anchor).toHaveAttribute('aria-expanded', 'true')
        expect(anchor.getAttribute('aria-controls')).toBe(card.getAttribute('id'))
    })

    it('closes on Escape and puts the caret back in the link', async () => {
        const { anchor, container } = await renderLinkedEditor('card-escape')
        openCard(anchor)
        const card = await findCard()

        fireEvent.keyDown(card, { key: 'Escape' })

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(container.querySelector('[contenteditable="true"]')))
    })

    it('closes once the caret moves out of the link', async () => {
        const { anchor, editor } = await renderLinkedEditor('card-caret-left')
        openCard(anchor)
        await findCard()

        selectInside(editor, 'tail')

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('opens from the toolbar link button when the caret is already in a link', async () => {
        const user = userEvent.setup()
        const { editor, container } = await renderLinkedEditor('card-toolbar')
        selectInside(editor, 'link')

        await user.click(screen.getByLabelText('Link'))

        expect(await findCard()).toHaveTextContent(URL)
        // The old behavior was to unlink on the spot.
        expect(container.querySelector('a')).not.toBeNull()
    })

    it('offers the open action a new tab', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const user = userEvent.setup()
        const { anchor } = await renderLinkedEditor('card-new-tab')
        openCard(anchor)
        await findCard()

        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.openInNewTab }))

        expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer')
    })

    it('removes the link and keeps its text', async () => {
        const user = userEvent.setup()
        const { anchor, container } = await renderLinkedEditor('card-remove')
        openCard(anchor)
        await findCard()

        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.remove }))

        await waitFor(() => expect(container.querySelector('a')).toBeNull())
        expect(container.querySelector('[contenteditable="true"]')).toHaveTextContent(LINK_TEXT)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('saves an edited URL and text, and brings a legacy link up to date', async () => {
        const user = userEvent.setup()
        const { anchor, container } = await renderLinkedEditor('card-edit', null)
        openCard(anchor)
        const card = await findCard()

        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.edit }))

        // Scoped to the card: the toolbar carries a "Link" button of its own.
        const text = await within(card).findByLabelText('Text')
        expect(text).toHaveValue(LINK_TEXT)
        expect(within(card).getByLabelText('Link')).toHaveValue(URL)

        await user.clear(text)
        await user.type(text, 'newer writeup')
        await user.clear(within(card).getByLabelText('Link'))
        await user.type(within(card).getByLabelText('Link'), 'https://example.com/newer')
        await user.click(within(card).getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            const updated = container.querySelector('a')!
            expect(updated.getAttribute('href')).toBe('https://example.com/newer')
            expect(updated.getAttribute('target')).toBe('_blank')
            expect(updated.getAttribute('rel')).toContain('noopener')
            expect(updated.textContent).toBe('newer writeup')
        })
    })

    it('names the destination of a link into the app', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org })
        const href = `${window.location.origin}/${org.slug}/study/${studyId}/view`

        const { anchor } = await renderLinkedEditor('card-internal', '_blank', href)
        openCard(anchor)
        const card = await findCard()

        expect(await within(card).findByText('my 1st study')).toBeInTheDocument()
        expect(within(card).getByText(`SafeInsights · ${displayOrgName(org.name)}`)).toBeInTheDocument()
    })

    it('refuses to save an invalid URL', async () => {
        const user = userEvent.setup()
        const { anchor, container } = await renderLinkedEditor('card-invalid')
        openCard(anchor)
        const card = await findCard()
        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.edit }))

        const url = await within(card).findByLabelText('Link')
        await user.clear(url)
        await user.type(url, 'not a url')
        await user.click(within(card).getByRole('button', { name: 'Save' }))

        expect(await screen.findByText(INVALID_URL_MESSAGE)).toBeInTheDocument()
        expect(container.querySelector('a')!.getAttribute('href')).toBe(URL)
    })
})
