import { renderWithProviders, fireEvent, screen, waitFor, describe, it, expect, vi } from '@/tests/unit.helpers'
import { LINK_CARD_DIALOG_LABEL, LINK_CARD_LABELS } from '@/components/link-hover-card/copy'
import { ReadOnlyLexicalContent } from './readonly-lexical-content'

const URL = 'https://example.com'

function textNode(text: string) {
    return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function paragraph(children: object[]) {
    return { children, direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 }
}

function root(children: object[]) {
    return JSON.stringify({ root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } })
}

function linkState(url: string, target: string | null) {
    return root([
        paragraph([
            {
                children: [textNode('example')],
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
        ]),
    ])
}

/** Mirrors how links were persisted before target/rel were set on insertion. */
const legacyLinkState = (url: string) => linkState(url, null)

async function renderLink(value: string) {
    const { container } = renderWithProviders(<ReadOnlyLexicalContent value={value} />)

    const anchor = await waitFor(() => {
        const found = container.querySelector('a')
        expect(found).not.toBeNull()
        return found!
    })

    return { container, anchor }
}

const findCard = () => screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

/** fireEvent has no auxClick shorthand, and the button is what the handler reads. */
const auxClick = (anchor: HTMLAnchorElement, button: number) =>
    fireEvent(anchor, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button }))

describe('ReadOnlyLexicalContent', () => {
    it('opens the link card on a click instead of navigating', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        fireEvent.click(anchor)

        const card = await findCard()
        expect(card).toHaveTextContent(URL)
        // Reading, the card offers copy alone: the edit tools belong to the editable field.
        expect(card.querySelectorAll('button')).toHaveLength(1)
        expect(open).not.toHaveBeenCalled()
    })

    it('offers the open action for a link stored without a target', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(legacyLinkState(URL))
        expect(anchor.getAttribute('target')).toBeNull()

        fireEvent.click(anchor)
        await findCard()
        fireEvent.click(screen.getByRole('button', { name: LINK_CARD_LABELS.openInNewTab }))

        expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer')
    })

    it('stays closed when the click ends a drag across the link', async () => {
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        fireEvent.mouseDown(anchor, { clientX: 20, clientY: 20 })
        fireEvent.click(anchor, { clientX: 160, clientY: 44 })

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('opens the destination straight away on a modified click', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        fireEvent.click(anchor, { ctrlKey: true })

        expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer')
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('opens the destination straight away on a middle click', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        auxClick(anchor, 1)

        expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer')
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('leaves the secondary click to the browser, so the context menu stands alone', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        // Not prevented, or the browser would have nothing to build its menu from.
        expect(auxClick(anchor, 2)).toBe(true)

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(open).not.toHaveBeenCalled()
    })

    it('leaves a shift or alt click to the browser', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        expect(fireEvent.click(anchor, { shiftKey: true })).toBe(true)
        expect(fireEvent.click(anchor, { altKey: true })).toBe(true)

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(open).not.toHaveBeenCalled()
    })

    it('opens the card from the keyboard and returns focus to the link on Escape', async () => {
        const { anchor } = await renderLink(linkState(URL, '_blank'))

        anchor.focus()
        fireEvent.keyDown(anchor, { key: 'Enter' })
        await findCard()

        // From the focused action inside the card, which is where a browser sends the key.
        await waitFor(() =>
            expect(document.activeElement).toBe(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })),
        )
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(document.activeElement).toBe(anchor)
    })

    it('renders paragraphs with the themed class that removes the default margin', async () => {
        const { container } = renderWithProviders(
            <ReadOnlyLexicalContent value={root([paragraph([textNode('first')]), paragraph([textNode('second')])])} />,
        )

        await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(2))
        // happy-dom does not load globals.css, so a computed margin would be empty either way.
        for (const p of container.querySelectorAll('p')) {
            expect(p.classList.contains('editable-text-paragraph')).toBe(true)
        }
    })

    it('renders nothing for a legacy empty-root state', () => {
        const { container } = renderWithProviders(<ReadOnlyLexicalContent value={root([])} />)

        expect(container.querySelector('p')).toBeNull()
    })
})
