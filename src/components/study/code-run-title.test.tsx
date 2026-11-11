import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { EMPTY_CELL } from '@/lib/dates'
import { CodeRunTitle } from './code-run-title'

describe('CodeRunTitle', () => {
    it('shows the bullet but keeps it out of the accessible name', async () => {
        renderWithProviders(
            <h3>
                <CodeRunTitle value={new Date('2026-03-05T12:00:00Z')} />
            </h3>,
        )

        const heading = await screen.findByRole('heading', { name: 'Code run Mar 05, 2026' })
        expect(heading).toHaveTextContent('Code run • Mar 05, 2026')
    })

    it('reads as just "Code run" when the run has no date', () => {
        renderWithProviders(
            <h3>
                <CodeRunTitle value={null} />
            </h3>,
        )

        const heading = screen.getByRole('heading', { name: 'Code run' })
        expect(heading).toHaveTextContent(`Code run • ${EMPTY_CELL}`)
    })
})
