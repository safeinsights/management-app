import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { CodeRunCard } from '@/components/study/code-run-card'

describe('CodeRunCard', () => {
    it('titles the card with the date the run finished and renders its sections below the title', () => {
        renderWithProviders(
            <CodeRunCard job={{ statusChanges: [{ status: 'RUN-COMPLETE', createdAt: '2026-03-05T12:00:00Z' }] }}>
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

    it('reads a run with no finish time as an unknown date', () => {
        renderWithProviders(
            <CodeRunCard job={{ statusChanges: [] }}>
                <p>Section</p>
            </CodeRunCard>,
        )

        expect(screen.getByRole('heading', { name: 'Code run date unknown' })).toBeInTheDocument()
    })
})
