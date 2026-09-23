import {
    describe,
    expect,
    fireEvent,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    vi,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import { LINK_CARD_DIALOG_LABEL, LINK_CARD_LABELS } from './copy'
import { LinkWithHoverCard } from './link-with-hover-card'

const renderLink = (href: string, text = 'Study Agreement') => {
    renderWithProviders(
        <LinkWithHoverCard href={href} icon={null}>
            {text}
        </LinkWithHoverCard>,
    )
    return screen.getByRole('link', { name: text })
}

const findCard = () => screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

describe('LinkWithHoverCard', () => {
    it('opens the card on a click instead of navigating', async () => {
        await mockSessionWithTestData()
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const link = renderLink(Routes.legal)

        const notPrevented = fireEvent.click(link)

        const card = await findCard()
        expect(notPrevented).toBe(false)
        await waitFor(() => expect(card).toHaveTextContent('Legal'))
        expect(card).toHaveTextContent('SafeInsights')
        expect(open).not.toHaveBeenCalled()
    })

    it('offers copy alone and opens the destination from the title in a new tab', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        fireEvent.click(link)

        const card = await findCard()
        const title = await within(card).findByRole('link', { name: 'Legal' })
        expect(title).toHaveAttribute('href', `${window.location.origin}${Routes.legal}`)
        expect(title).toHaveAttribute('target', '_blank')
        expect(within(card).getAllByRole('button')).toHaveLength(1)
        expect(within(card).getByRole('button', { name: LINK_CARD_LABELS.copy })).toBeInTheDocument()
    })

    it('names the study behind a link to one of its pages', async () => {
        const { org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyOnly({ org, title: 'Highlighting and learning outcomes' })
        const link = renderLink(Routes.studyReviewProposal({ orgSlug: org.slug, studyId: study.id }), 'proposal')

        fireEvent.click(link)

        const card = await findCard()
        await waitFor(() => expect(card).toHaveTextContent('Highlighting and learning outcomes'))
    })

    it('leaves a modified click to the browser', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
            expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
        }

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('leaves a modified Enter to the browser', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
            expect(fireEvent.keyDown(link, { key: 'Enter', [modifier]: true })).toBe(true)
        }

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes the card when the link is clicked again', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        fireEvent.click(link)
        await findCard()
        fireEvent.click(link)

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(link).toHaveAttribute('aria-expanded', 'false')
    })

    it('continues the tab order from the link when Tab leaves the card', async () => {
        await mockSessionWithTestData()
        renderWithProviders(
            <>
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    Study Agreement
                </LinkWithHoverCard>
                <button type="button">next field</button>
            </>,
        )
        const link = screen.getByRole('link', { name: 'Study Agreement' })

        fireEvent.click(link)
        const copy = await within(await findCard()).findByRole('button', { name: LINK_CARD_LABELS.copy })
        fireEvent.keyDown(copy, { key: 'Tab' })

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'next field' }))

        fireEvent.click(link)
        const title = await within(await findCard()).findByRole('link', { name: 'Legal' })
        fireEvent.keyDown(title, { key: 'Tab', shiftKey: true })

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(document.activeElement).toBe(link)
    })

    it('opens from the keyboard and returns focus to the link on Escape', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        for (const key of ['Enter', ' ']) {
            link.focus()
            fireEvent.keyDown(link, { key })
            await findCard()

            await waitFor(() =>
                expect(document.activeElement).toBe(screen.getByRole('button', { name: LINK_CARD_LABELS.copy })),
            )
            fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
            expect(document.activeElement).toBe(link)
        }
    })

    it('tells assistive technology that the link controls the card', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        expect(link).toHaveAttribute('aria-haspopup', 'dialog')

        fireEvent.click(link)

        const card = await findCard()
        expect(link).toHaveAttribute('aria-expanded', 'true')
        expect(link).toHaveAttribute('aria-controls', card.id)
    })

    it('keeps one card open at a time', async () => {
        await mockSessionWithTestData()
        renderWithProviders(
            <>
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    first
                </LinkWithHoverCard>
                <LinkWithHoverCard href={Routes.dashboard} icon={null}>
                    second
                </LinkWithHoverCard>
            </>,
        )

        fireEvent.click(screen.getByRole('link', { name: 'first' }))
        await findCard()
        fireEvent.click(screen.getByRole('link', { name: 'second' }))

        await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('My dashboard'))
    })
})
