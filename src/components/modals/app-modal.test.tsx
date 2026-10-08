import { describe, expect, fireEvent, it, renderWithProviders, screen, vi, waitFor } from '@/tests/unit.helpers'
import { LINK_CARD_DIALOG_LABEL, LINK_CARD_LABELS } from '@/components/link-hover-card/copy'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { AppModal } from './app-modal'

const linkState = JSON.stringify({
    root: {
        type: 'root',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
            {
                type: 'paragraph',
                version: 1,
                direction: 'ltr',
                format: '',
                indent: 0,
                children: [
                    {
                        type: 'link',
                        version: 1,
                        direction: 'ltr',
                        format: '',
                        indent: 0,
                        rel: 'noopener noreferrer',
                        target: '_blank',
                        title: null,
                        url: 'https://example.com',
                        children: [
                            { type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'example' },
                        ],
                    },
                ],
            },
        ],
    },
})

const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

describe('AppModal', () => {
    it('names the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details">
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('keeps a caller-supplied name for the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details" closeButtonProps={{ 'aria-label': 'Dismiss' }}>
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })

    it('leaves the first Escape to a link card open inside it (OTTER-792)', async () => {
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Preview">
                <ReadOnlyLexicalContent value={linkState} />
            </AppModal>,
        )

        const anchor = await screen.findByRole('link', { name: 'example' })
        fireEvent.click(anchor)
        await screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })
        await waitFor(() =>
            expect(document.activeElement).toBe(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })),
        )

        pressEscape()

        await waitFor(() => expect(screen.queryByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })).toBeNull())
        expect(onClose).not.toHaveBeenCalled()
        expect(document.activeElement).toBe(anchor)

        pressEscape()

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('keeps Escape off when the caller turns it off', () => {
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Details" closeOnEscape={false}>
                Body
            </AppModal>,
        )

        fireEvent.keyDown(document.body, { key: 'Escape' })

        expect(onClose).not.toHaveBeenCalled()
    })
})
