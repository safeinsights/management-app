import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { CodeSummarySection } from './code-summary-section'

describe('CodeSummarySection', () => {
    it('renders question/answer pairs when a summary is provided', () => {
        const summary = [
            { question: 'What does this code do?', answer: 'It analyzes some data.' },
            { question: 'What libraries?', answer: 'pandas, numpy.' },
        ]

        renderWithProviders(<CodeSummarySection summary={summary} />)

        expect(screen.getByText('What does this code do?')).toBeInTheDocument()
        expect(screen.getByText('It analyzes some data.')).toBeInTheDocument()
        expect(screen.getByText('What libraries?')).toBeInTheDocument()
        expect(screen.getByText('pandas, numpy.')).toBeInTheDocument()
    })

    it('renders the unavailable state when summary is null', () => {
        renderWithProviders(<CodeSummarySection summary={null} />)

        expect(screen.getByText('Summary unavailable')).toBeInTheDocument()
    })
})
