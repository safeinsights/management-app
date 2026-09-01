import { renderWithProviders, fireEvent, waitFor, describe, it, expect, vi } from '@/tests/unit.helpers'
import { ReadOnlyLexicalContent } from './readonly-lexical-content'

function textNode(text: string) {
    return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function paragraph(children: object[]) {
    return { children, direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 }
}

function root(children: object[]) {
    return JSON.stringify({ root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } })
}

// Mirrors how links were persisted before target/rel were set on insertion.
function legacyLinkState(url: string) {
    return root([
        paragraph([
            {
                children: [textNode('example')],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'link',
                version: 1,
                rel: null,
                target: null,
                title: null,
                url,
            },
        ]),
    ])
}

describe('ReadOnlyLexicalContent', () => {
    it('opens a link stored without a target in a new tab', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const { container } = renderWithProviders(
            <ReadOnlyLexicalContent value={legacyLinkState('https://example.com')} />,
        )

        const anchor = await waitFor(() => {
            const found = container.querySelector('a')
            expect(found).not.toBeNull()
            return found!
        })
        expect(anchor.getAttribute('target')).toBeNull()

        fireEvent.click(anchor)

        await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com', '_blank'))
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
