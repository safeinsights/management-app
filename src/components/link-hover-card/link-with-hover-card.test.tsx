import {
    act,
    afterEach,
    describe,
    expect,
    fireEvent,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import { LINK_CARD_DIALOG_LABEL, LINK_CARD_LABELS } from './copy'
import { LINK_CARD_HOVER_CLOSE_DELAY_MS, LinkWithHoverCard } from './link-with-hover-card'

const renderLink = (href: string, text = 'Study Agreement') => {
    renderWithProviders(
        <LinkWithHoverCard href={href} icon={null}>
            {text}
        </LinkWithHoverCard>,
    )
    return screen.getByRole('link', { name: text })
}

const findCard = () => screen.findByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

const queryCard = () => screen.queryByRole('dialog', { name: LINK_CARD_DIALOG_LABEL })

// happy-dom leaves pointerType empty unless the event says otherwise.
const mouse = { pointerType: 'mouse' }

const passHoverCloseDelay = () => act(() => vi.advanceTimersByTime(LINK_CARD_HOVER_CLOSE_DELAY_MS + 1))

describe('LinkWithHoverCard', () => {
    afterEach(() => vi.useRealTimers())

    it('opens the card on hover and leaves the page and focus where they are', async () => {
        await mockSessionWithTestData()
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const link = renderLink(Routes.legal)

        await userEvent.hover(link)

        const card = await findCard()
        await waitFor(() => expect(card).toHaveTextContent('Legal'))
        expect(card).toHaveTextContent('SafeInsights')
        expect(document.activeElement).toBe(document.body)
        expect(open).not.toHaveBeenCalled()
    })

    it('closes once the pointer has left the link', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        await userEvent.hover(link)
        await findCard()

        vi.useFakeTimers()
        fireEvent.pointerLeave(link, mouse)
        expect(queryCard()).not.toBeNull()
        passHoverCloseDelay()

        expect(queryCard()).toBeNull()
    })

    it('stays open while the pointer moves from the link into the card', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        await userEvent.hover(link)
        const card = await findCard()

        vi.useFakeTimers()
        fireEvent.pointerLeave(link, mouse)
        fireEvent.pointerEnter(card, mouse)
        passHoverCloseDelay()

        expect(queryCard()).not.toBeNull()
    })

    it('closes on pointer leave while the link holds focus from a mouse click', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        await userEvent.hover(link)
        await findCard()
        // happy-dom matches :focus-visible on any focus; a browser does not after a mouse click.
        const matches = link.matches.bind(link)
        vi.spyOn(link, 'matches').mockImplementation((selector) => selector !== ':focus-visible' && matches(selector))
        link.focus()

        vi.useFakeTimers()
        fireEvent.pointerLeave(link, mouse)
        passHoverCloseDelay()

        expect(queryCard()).toBeNull()
    })

    it('stays open on pointer leave while keyboard focus is on the link', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        link.focus()
        await findCard()
        fireEvent.pointerEnter(link, mouse)

        vi.useFakeTimers()
        fireEvent.pointerLeave(link, mouse)
        passHoverCloseDelay()

        expect(queryCard()).not.toBeNull()
    })

    it('ignores touch and pen pointers, so a tap follows the link', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        fireEvent.pointerEnter(link, { pointerType: 'touch' })
        fireEvent.pointerEnter(link, { pointerType: 'pen' })

        expect(queryCard()).toBeNull()
    })

    it('follows the link in a new tab on a click and closes the card', async () => {
        await mockSessionWithTestData()
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const link = renderLink(Routes.legal)
        await userEvent.hover(link)
        await findCard()

        const notPrevented = fireEvent.click(link)

        expect(notPrevented).toBe(true)
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        await waitFor(() => expect(queryCard()).toBeNull())
        expect(open).not.toHaveBeenCalled()
    })

    it('leaves a modified click to the browser', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
            expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
        }

        expect(queryCard()).toBeNull()
    })

    it('leaves Enter to the browser, with or without a modifier', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(true)
        for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
            expect(fireEvent.keyDown(link, { key: 'Enter', [modifier]: true })).toBe(true)
        }
    })

    it('opens on keyboard focus, tabs on to the card title, and closes once focus leaves both', async () => {
        await mockSessionWithTestData()
        const user = userEvent.setup()
        renderWithProviders(
            <>
                <button type="button">previous field</button>
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    Study Agreement
                </LinkWithHoverCard>
                <button type="button">next field</button>
            </>,
        )
        const link = screen.getByRole('link', { name: 'Study Agreement' })
        const previous = screen.getByRole('button', { name: 'previous field' })

        await user.tab()
        await user.tab()
        expect(document.activeElement).toBe(link)
        const card = await findCard()
        const title = await within(card).findByRole('link', { name: 'Legal' })
        expect(document.activeElement).toBe(link)

        await user.tab()
        expect(document.activeElement).toBe(title)
        await user.tab()
        expect(document.activeElement).toBe(within(card).getByRole('button', { name: LINK_CARD_LABELS.copy }))
        await user.tab()
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'next field' }))
        await waitFor(() => expect(screen.queryByRole('link', { name: 'Legal' })).toBeNull())

        await user.tab({ shift: true })
        expect(document.activeElement).toBe(link)
        await findCard()
        await user.tab({ shift: true })
        expect(document.activeElement).toBe(previous)
        await waitFor(() => expect(queryCard()).toBeNull())
    })

    it('closes on Escape from the card and returns focus to the link without reopening', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        link.focus()
        const card = await findCard()
        const title = await within(card).findByRole('link', { name: 'Legal' })
        title.focus()
        fireEvent.keyDown(title, { key: 'Escape' })

        await waitFor(() => expect(queryCard()).toBeNull())
        expect(document.activeElement).toBe(link)
        expect(link).toHaveAttribute('aria-expanded', 'false')
    })

    it('closes once focus leaves, after Escape closed the card from under the pointer', async () => {
        await mockSessionWithTestData()
        const user = userEvent.setup()
        renderWithProviders(
            <>
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    Study Agreement
                </LinkWithHoverCard>
                <button type="button">next field</button>
            </>,
        )
        const link = screen.getByRole('link', { name: 'Study Agreement' })
        fireEvent.pointerEnter(link, mouse)
        fireEvent.pointerEnter(await findCard(), mouse)
        fireEvent.keyDown(document.body, { key: 'Escape' })
        await waitFor(() => expect(queryCard()).toBeNull())

        link.focus()
        const card = await findCard()
        await within(card).findByRole('link', { name: 'Legal' })
        await user.tab()
        await user.tab()
        await user.tab()

        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'next field' }))
        await waitFor(() => expect(queryCard()).toBeNull())
    })

    it('offers copy alone and opens the destination from the title in a new tab', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)

        await userEvent.hover(link)

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

        await userEvent.hover(link)

        const card = await findCard()
        await waitFor(() => expect(card).toHaveTextContent('Highlighting and learning outcomes'))
    })

    it('tells assistive technology that the link controls the card', async () => {
        await mockSessionWithTestData()
        const link = renderLink(Routes.legal)
        expect(link).toHaveAttribute('aria-haspopup', 'dialog')

        await userEvent.hover(link)

        const card = await findCard()
        expect(link).toHaveAttribute('aria-expanded', 'true')
        expect(link).toHaveAttribute('aria-controls', card.id)
    })

    it('keeps one card open at a time', async () => {
        const { org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyOnly({ org, title: 'Highlighting and learning outcomes' })
        renderWithProviders(
            <>
                <LinkWithHoverCard
                    href={Routes.studyReviewProposal({ orgSlug: org.slug, studyId: study.id })}
                    icon={null}
                >
                    first
                </LinkWithHoverCard>
                <LinkWithHoverCard href={Routes.legal} icon={null}>
                    second
                </LinkWithHoverCard>
            </>,
        )

        fireEvent.pointerEnter(screen.getByRole('link', { name: 'first' }), mouse)
        await findCard()
        fireEvent.pointerEnter(screen.getByRole('link', { name: 'second' }), mouse)

        await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
        await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Legal'))
    })
})
