import { renderWithProviders, screen, userEvent, describe, it, expect, vi } from '@/tests/unit.helpers'
import { LinkHoverCard, linkCardActionVisibility } from './link-hover-card'
import { LINK_CARD_LABELS, LINK_COPIED_ANNOUNCEMENT, UNAVAILABLE_LINK_BODY, UNAVAILABLE_LINK_TITLE } from './copy'
import type { LinkPreview } from './link-preview'

const URL = 'https://example.com/a/very/long/path'

const external: LinkPreview = { kind: 'external', href: URL }
const internal: LinkPreview = {
    kind: 'internal',
    href: URL,
    title: 'Study: environment and learning',
    category: 'OpenStax',
}
const unavailable: LinkPreview = { kind: 'unavailable', href: URL }

function renderCard(preview: LinkPreview, overrides: Partial<Parameters<typeof LinkHoverCard>[0]> = {}) {
    return renderWithProviders(
        <LinkHoverCard preview={preview} mode="edit" opensInNewTab onOpenInNewTab={vi.fn()} {...overrides} />,
    )
}

const buttonNames = () =>
    screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
        .filter((label): label is string => label !== null)

describe('LinkHoverCard', () => {
    it('shows the full URL of an external link as a link that opens in a new tab', () => {
        renderCard(external)

        const anchor = screen.getByRole('link', { name: URL })
        expect(anchor).toHaveAttribute('href', URL)
        expect(anchor).toHaveAttribute('target', '_blank')
        expect(anchor.getAttribute('rel')).toContain('noopener')
    })

    it('shows the destination title and category for an internal link', () => {
        renderCard(internal)

        expect(screen.getByRole('link', { name: 'Study: environment and learning' })).toBeInTheDocument()
        expect(screen.getByText('SafeInsights · OpenStax')).toBeInTheDocument()
    })

    it('shows the unavailable copy without a link or an open action', () => {
        renderCard(unavailable)

        expect(screen.getByText(UNAVAILABLE_LINK_TITLE)).toBeInTheDocument()
        expect(screen.getByText(UNAVAILABLE_LINK_BODY)).toBeInTheDocument()
        expect(screen.queryByRole('link')).toBeNull()
        expect(buttonNames()).toEqual([LINK_CARD_LABELS.copy, LINK_CARD_LABELS.edit, LINK_CARD_LABELS.remove])
    })

    it('offers all four actions while editing', () => {
        renderCard(external)

        expect(buttonNames()).toEqual([
            LINK_CARD_LABELS.copy,
            LINK_CARD_LABELS.openInNewTab,
            LINK_CARD_LABELS.edit,
            LINK_CARD_LABELS.remove,
        ])
    })

    it('offers copy alone for a read-only link already set to open in a new tab', () => {
        renderCard(external, { mode: 'readOnly', opensInNewTab: true })

        expect(buttonNames()).toEqual([LINK_CARD_LABELS.copy])
    })

    it('adds the open action for a read-only link not set to open in a new tab', () => {
        renderCard(external, { mode: 'readOnly', opensInNewTab: false })

        expect(buttonNames()).toEqual([LINK_CARD_LABELS.copy, LINK_CARD_LABELS.openInNewTab])
    })

    it('copies the URL and announces it', async () => {
        // userEvent.setup installs its own clipboard stub, so the write lands there.
        const user = userEvent.setup()
        renderCard(external)

        expect(screen.getByRole('status')).toHaveTextContent('')

        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.copy }))

        expect(await navigator.clipboard.readText()).toBe(URL)
        expect(await screen.findByText(LINK_COPIED_ANNOUNCEMENT)).toBeInTheDocument()
        // The accessible name stays put so the button does not rename itself mid-interaction.
        expect(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })).toBeInTheDocument()
    })

    it('shows an action tooltip on keyboard focus', async () => {
        renderCard(external)

        screen.getByRole('button', { name: LINK_CARD_LABELS.edit }).focus()

        expect(await screen.findByText(LINK_CARD_LABELS.edit)).toBeInTheDocument()
    })

    it('runs the edit, remove and open handlers', async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()
        const onRemove = vi.fn()
        const onOpenInNewTab = vi.fn()
        renderCard(external, { onEdit, onRemove, onOpenInNewTab })

        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.openInNewTab }))
        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.edit }))
        await user.click(screen.getByRole('button', { name: LINK_CARD_LABELS.remove }))

        expect(onOpenInNewTab).toHaveBeenCalledOnce()
        expect(onEdit).toHaveBeenCalledOnce()
        expect(onRemove).toHaveBeenCalledOnce()
    })
})

describe('linkCardActionVisibility', () => {
    it('hides the edit tools in read-only mode', () => {
        expect(linkCardActionVisibility('readOnly', external, false)).toEqual({
            openInNewTab: true,
            edit: false,
            remove: false,
        })
    })

    it('hides the open action for an unreachable internal destination', () => {
        expect(linkCardActionVisibility('edit', unavailable, false)).toEqual({
            openInNewTab: false,
            edit: true,
            remove: true,
        })
    })
})
