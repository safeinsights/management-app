import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyReviewSection } from './study-review-section'
import { getStudyReviewAction } from '@/server/actions/study-job.actions'
import type { AnalysisReport } from '@/server/agents/review-agent/types'
import type { StudyReviewWithMeta } from '@/server/db/queries'

vi.mock('@/server/actions/study-job.actions', () => ({
    getStudyReviewAction: vi.fn(),
}))

beforeEach(() => {
    vi.mocked(getStudyReviewAction).mockResolvedValue(null)
})

const baseReport: AnalysisReport = {
    proposalSummary: 'Studying student performance trends.',
    codeExplanation: 'Aggregates scores grouped by school.',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

function buildReview(report: AnalysisReport, files: string[] = ['main.r']): StudyReviewWithMeta {
    return {
        report,
        createdAt: new Date('2026-04-28T12:00:00Z'),
        files: files.map((name) => ({ name, fileType: 'MAIN-CODE' as const })),
    }
}

describe('StudyReviewSection', () => {
    it('renders summaries and check badges when a review is provided', () => {
        renderWithProviders(<StudyReviewSection studyJobId="job-1" initialReview={buildReview(baseReport)} />)

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

        renderWithProviders(<StudyReviewSection studyJobId="job-1" initialReview={buildReview(report)} />)

        expect(screen.getByText('Misaligned')).toBeInTheDocument()
        expect(screen.getByText('Code skips step 3 from proposal')).toBeInTheDocument()
        expect(screen.getByText('Non-compliant')).toBeInTheDocument()
        expect(screen.getByText('Logs raw student IDs')).toBeInTheDocument()
    })

    it('renders the in-progress state when the runner has not yet produced a row', () => {
        renderWithProviders(<StudyReviewSection studyJobId="job-1" initialReview={null} />)

        expect(screen.getByText('Review in progress…')).toBeInTheDocument()
    })

    it('renders a non-crashing error state when the stored report is malformed', () => {
        renderWithProviders(<StudyReviewSection studyJobId="job-1" initialReview="malformed" />)

        expect(screen.getByTestId('study-review-malformed')).toHaveTextContent(
            'AI review for this submission could not be displayed',
        )
    })

    it('lists the files the review was generated against', () => {
        renderWithProviders(
            <StudyReviewSection
                studyJobId="job-1"
                initialReview={buildReview(baseReport, ['main.r', 'dragon_art.R'])}
            />,
        )

        expect(screen.getByText('Files reviewed: main.r, dragon_art.R')).toBeInTheDocument()
    })

    it('renders resultsSummary when present', () => {
        const report: AnalysisReport = {
            ...baseReport,
            resultsSummary: 'Median score 82, no anomalies.',
        }

        renderWithProviders(<StudyReviewSection studyJobId="job-1" initialReview={buildReview(report)} />)

        expect(screen.getByText('Median score 82, no anomalies.')).toBeInTheDocument()
    })
})
