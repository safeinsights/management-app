import { describe, expect, it } from 'vitest'
import { faker, renderWithProviders, screen } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { CodeRunFeedback, type CodeRunFeedbackRow } from './code-run-feedback'

const feedbackRow = (overrides: Partial<CodeRunFeedbackRow> = {}): CodeRunFeedbackRow => ({
    id: faker.string.uuid(),
    body: JSON.parse(lexicalJson('Outputs look clean.')),
    createdAt: new Date('2026-03-05T12:00:00Z'),
    round: 2,
    authorName: 'Jessica Walters',
    ...overrides,
})

describe('CodeRunFeedback', () => {
    it('shows each entry with its title, author and text', async () => {
        renderWithProviders(<CodeRunFeedback feedback={[feedbackRow()]} testId="latest-run-feedback" />)

        const section = screen.getByTestId('latest-run-feedback')
        expect(section).toHaveTextContent('Reviewer feedback (v2.0)')
        expect(section).toHaveTextContent('Jessica Walters')
        expect(await screen.findByText('Outputs look clean.')).toBeInTheDocument()
    })

    it('says no feedback was shared when the run has none', () => {
        renderWithProviders(<CodeRunFeedback feedback={[]} />)

        const section = screen.getByTestId('code-run-feedback')
        expect(section).toHaveTextContent('Reviewer feedback')
        expect(section).toHaveTextContent('No feedback was shared for this run.')
    })

    it('shows a load error instead of reading a failed query as no feedback', () => {
        renderWithProviders(<CodeRunFeedback feedback={[]} loadError />)

        expect(screen.getByText('Feedback could not be loaded')).toBeInTheDocument()
        expect(screen.queryByText('No feedback was shared for this run.')).not.toBeInTheDocument()
    })
})
