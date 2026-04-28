import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyReviewSection } from './study-review-section'
import type { AnalysisReport } from '@/server/review-agent'

const baseReport: AnalysisReport = {
    proposalSummary: 'Studying student performance trends.',
    codeExplanation: 'Aggregates scores grouped by school.',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

describe('StudyReviewSection', () => {
    it('renders summaries and check badges when a review is provided', () => {
        renderWithProviders(<StudyReviewSection review={baseReport} />)

        expect(screen.getByText('Studying student performance trends.')).toBeInTheDocument()
        expect(screen.getByText('Aggregates scores grouped by school.')).toBeInTheDocument()
        expect(screen.getByText('Aligned')).toBeInTheDocument()
        expect(screen.getByText('Compliant')).toBeInTheDocument()
    })

    it('renders findings when checks fail', () => {
        const report: AnalysisReport = {
            ...baseReport,
            alignmentCheck: { isAligned: false, findings: ['Code skips step 3 from proposal'] },
            complianceCheck: { isCompliant: false, findings: ['Logs raw student IDs'] },
        }

        renderWithProviders(<StudyReviewSection review={report} />)

        expect(screen.getByText('Misaligned')).toBeInTheDocument()
        expect(screen.getByText('Code skips step 3 from proposal')).toBeInTheDocument()
        expect(screen.getByText('Non-compliant')).toBeInTheDocument()
        expect(screen.getByText('Logs raw student IDs')).toBeInTheDocument()
    })

    it('renders the unavailable state when review is null', () => {
        renderWithProviders(<StudyReviewSection review={null} />)

        expect(screen.getByText('Review unavailable')).toBeInTheDocument()
    })

    it('renders resultsSummary when present', () => {
        const report: AnalysisReport = {
            ...baseReport,
            resultsSummary: 'Median score 82, no anomalies.',
        }

        renderWithProviders(<StudyReviewSection review={report} />)

        expect(screen.getByText('Median score 82, no anomalies.')).toBeInTheDocument()
    })
})
