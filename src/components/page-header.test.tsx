import { describe, expect, it, pageHeaderEyebrow, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
    it('renders the title as the level-1 heading', () => {
        renderWithProviders(<PageHeader title="Manage team" />)

        expect(screen.getByRole('heading', { level: 1, name: 'Manage team' })).toBeInTheDocument()
    })

    it('renders the eyebrow above the heading without making it a heading', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Manage team" />)

        const eyebrow = screen.getByText('Genius Research Lab')
        const heading = screen.getByRole('heading', { level: 1, name: 'Manage team' })

        expect(eyebrow.tagName).not.toMatch(/^H\d$/)
        expect(eyebrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the eyebrow text in its original casing so screen readers do not spell it out', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Manage team" />)

        expect(screen.getByText('Genius Research Lab')).toBeInTheDocument()
        expect(screen.queryByText('GENIUS RESEARCH LAB')).not.toBeInTheDocument()
    })

    // The slot stays in the DOM so the heading keeps its position on every page, but it must carry
    // no text a screen reader would announce. Its reserved height is a layout fact, so
    // tests/page-header.spec.ts measures that in a real browser.
    it('reserves an empty eyebrow slot when none is given', () => {
        renderWithProviders(<PageHeader title="My studies" />)

        expect(screen.getByRole('heading', { level: 1, name: 'My studies' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('')
    })

    it('treats a null eyebrow the same as an absent one', () => {
        renderWithProviders(<PageHeader eyebrow={null} title="Security key" />)

        expect(pageHeaderEyebrow()).toBe('')
    })

    it('renders exactly one level-1 heading', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Study title" />)

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    it('clamps the title at two lines and the eyebrow at one', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Manage team" />)

        const heading = screen.getByRole('heading', { level: 1, name: 'Manage team' })
        expect(heading.style.getPropertyValue('--title-line-clamp')).toBe('2')
        expect(screen.getByTestId('page-header-eyebrow')).toHaveAttribute('data-truncate', 'end')
    })

    it('offers no hover title while nothing is cut off', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Manage team" />)

        expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('title')
        expect(screen.getByTestId('page-header-eyebrow')).not.toHaveAttribute('title')
    })

    it('offers the full title and eyebrow on hover once they are cut off', () => {
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
        const title = 'A very long study title '.repeat(6).trim()
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title={title} />)

        expect(screen.getByRole('heading', { level: 1, name: title })).toHaveAttribute('title', title)
        expect(screen.getByTestId('page-header-eyebrow')).toHaveAttribute('title', 'Genius Research Lab')
    })

    it('renders the badge after the heading rather than inside it', () => {
        renderWithProviders(<PageHeader title="Study title" badge={<span>Badge</span>} />)

        const heading = screen.getByRole('heading', { level: 1, name: 'Study title' })
        const badge = screen.getByText('Badge')
        expect(heading).not.toContainElement(badge)
        expect(heading.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
})
