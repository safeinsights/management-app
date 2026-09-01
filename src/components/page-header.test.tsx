import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
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

    it('renders no eyebrow text when none is given', () => {
        const { container } = renderWithProviders(<PageHeader title="My dashboard" />)

        expect(screen.getByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
        expect(container.textContent).toBe('My dashboard')
    })

    it('treats a null eyebrow the same as an absent one', () => {
        const { container } = renderWithProviders(<PageHeader eyebrow={null} title="Security key" />)

        expect(container.textContent).toBe('Security key')
    })

    it('renders exactly one level-1 heading', () => {
        renderWithProviders(<PageHeader eyebrow="Genius Research Lab" title="Study title" />)

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
