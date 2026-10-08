import { useState } from 'react'
import { Button } from '@mantine/core'
import {
    describe,
    expect,
    fireEvent,
    it,
    lexicalLinkState,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { LINK_CARD_DIALOG_LABEL, LINK_CARD_LABELS } from '@/components/link-hover-card/copy'
import { LinkWithHoverCard } from '@/components/link-hover-card/link-with-hover-card'
import { SingleUserEditor } from '@/components/editable-text/single-user-editor'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { Routes } from '@/lib/routes'
import { AppModal } from './app-modal'

const linkState = lexicalLinkState({ url: 'https://example.com' })

const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

const findCard = () => screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

const waitForCardClosed = () =>
    waitFor(() => expect(screen.queryByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })).toBeNull())

async function openReadOnlyCard() {
    const anchor = await screen.findByRole('link', { name: 'example' })
    fireEvent.click(anchor)
    await findCard()
    await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })),
    )
    return anchor
}

async function expectEscapeClosesCardThenModal(onClose: () => void) {
    pressEscape()
    await waitForCardClosed()
    expect(onClose).not.toHaveBeenCalled()

    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
}

function PageWithPreview({ onClose }: { onClose: () => void }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <SingleUserEditor id="page-field" initialValue={linkState} ariaLabel="Research questions" />
            <Button onClick={() => setIsOpen(true)}>Open preview</Button>
            <AppModal isOpen={isOpen} onClose={onClose} title="Preview">
                Body
            </AppModal>
        </>
    )
}

describe('AppModal', () => {
    it('names the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details">
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('lets the caller rename the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details" closeButtonProps={{ 'aria-label': 'Dismiss' }}>
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })
})

describe('AppModal with a link card (OTTER-792)', () => {
    it('leaves the first Escape to a read-only link card open inside it', async () => {
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Preview">
                <ReadOnlyLexicalContent value={linkState} />
            </AppModal>,
        )
        const anchor = await openReadOnlyCard()

        pressEscape()

        await waitForCardClosed()
        expect(onClose).not.toHaveBeenCalled()
        expect(document.activeElement).toBe(anchor)

        pressEscape()

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('leaves the first Escape to an editor link card open inside it', async () => {
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Preview">
                <SingleUserEditor id="modal-field" initialValue={linkState} ariaLabel="Research questions" />
            </AppModal>,
        )
        fireEvent.click(await screen.findByRole('link', { name: 'example' }))
        await findCard()

        await expectEscapeClosesCardThenModal(onClose)
    })

    it('leaves the first Escape to a plain link card open inside it', async () => {
        await mockSessionWithTestData()
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Preview">
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    Study Agreement
                </LinkWithHoverCard>
            </AppModal>,
        )
        await userEvent.hover(screen.getByRole('link', { name: 'Study Agreement' }))
        await findCard()

        await expectEscapeClosesCardThenModal(onClose)
    })

    it('keeps Escape off after a card closes when the caller turns it off', async () => {
        const onClose = vi.fn()
        renderWithProviders(
            <AppModal isOpen onClose={onClose} title="Preview" closeOnEscape={false}>
                <ReadOnlyLexicalContent value={linkState} />
            </AppModal>,
        )
        await openReadOnlyCard()

        pressEscape()
        await waitForCardClosed()
        pressEscape()

        expect(onClose).not.toHaveBeenCalled()
    })

    it('closes a card left open on the page as it opens, so the first Escape closes the modal', async () => {
        const onClose = vi.fn()
        renderWithProviders(<PageWithPreview onClose={onClose} />)
        fireEvent.click(await screen.findByRole('link', { name: 'example' }))
        await findCard()

        // A click with no pointer press, as a keyboard user activating the button, leaves the card open.
        fireEvent.click(screen.getByRole('button', { name: 'Open preview' }))

        await waitForCardClosed()
        pressEscape()
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
