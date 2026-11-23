import { describe, expect, hydrateServerHtml, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { CodeRunCard } from '@/components/study/code-run-card'
import { EMPTY_CELL } from '@/lib/dates'

describe('CodeRunCard', () => {
    it('titles the card with the given date and renders its sections below the title', () => {
        renderWithProviders(
            <CodeRunCard date="2026-03-05T12:00:00Z">
                <p>First section</p>
                <p>Second section</p>
            </CodeRunCard>,
        )

        const heading = screen.getByRole('heading', { name: 'Code run Mar 05, 2026' })
        const first = screen.getByText('First section')
        expect(heading.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(
            first.compareDocumentPosition(screen.getByText('Second section')) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('reads a missing date as an unknown date', () => {
        renderWithProviders(
            <CodeRunCard date={null}>
                <p>Section</p>
            </CodeRunCard>,
        )

        const heading = screen.getByRole('heading', { name: 'Code run date unknown' })
        expect(heading).toHaveTextContent(`Code run • ${EMPTY_CELL}`)
    })

    // Tests run in America/Chicago, where a run ending after UTC midnight is still the day before.
    it('hydrates without a mismatch when the date is after UTC midnight', async () => {
        const { recoverableErrors } = hydrateServerHtml(
            <CodeRunCard date="2026-09-24T01:30:00Z">
                <p>Section</p>
            </CodeRunCard>,
        )

        expect(await screen.findByRole('heading', { name: 'Code run Sep 23, 2026' })).toBeInTheDocument()
        expect(recoverableErrors).toEqual([])
    })
})
