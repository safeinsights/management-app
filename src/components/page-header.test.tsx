import { describe, expect, it, pageHeaderEyebrow, renderWithProviders, screen } from '@/tests/unit.helpers'
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

    // The slot stays in the DOM so the heading keeps its position on every page. It holds a
    // non-breaking space to have any height at all, so it must be hidden rather than merely empty.
    it('reserves an empty eyebrow slot when none is given, hidden from screen readers', () => {
        renderWithProviders(<PageHeader title="My dashboard" />)

        expect(screen.getByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('')
        expect(screen.getByTestId('page-header-eyebrow')).toHaveAttribute('aria-hidden', 'true')
    })

    it('leaves a filled eyebrow visible to screen readers', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Manage team" />)

        expect(screen.getByTestId('page-header-eyebrow')).not.toHaveAttribute('aria-hidden', 'true')
    })

    it('treats a null eyebrow the same as an absent one', () => {
        renderWithProviders(<PageHeader eyebrow={null} title="Security key" />)

        expect(pageHeaderEyebrow()).toBe('')
    })

    it('renders exactly one level-1 heading', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Study title" />)

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
