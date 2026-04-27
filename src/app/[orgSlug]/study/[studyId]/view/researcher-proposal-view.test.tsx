import { lexicalJson } from '@/lib/word-count'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ResearcherProposalView } from './researcher-proposal-view'

describe('ResearcherProposalView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'lab' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            title: 'Test Study Title',
            piName: 'Dr. Smith',
            datasets: ['Dataset A', 'Dataset B'],
            researchQuestions: lexicalJson('What is the effect of X on Y?'),
            projectSummary: lexicalJson('This study examines the relationship between X and Y.'),
            impact: lexicalJson('This could improve treatment outcomes.'),
            additionalNotes: lexicalJson('Funding secured from NIH.'),
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: study.id })
    })

    it('renders STEP 2 and Study proposal (not STEP 1 / Review study proposal)', async () => {
        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={study} />)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.queryByText('STEP 1')).not.toBeInTheDocument()
        expect(screen.queryByText('Review study proposal')).not.toBeInTheDocument()
    })

    it('does not render reviewer intro text', () => {
        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={study} />)

        expect(screen.queryByText('You have a new data use request', { exact: false })).not.toBeInTheDocument()
    })

    it('shows all proposal fields', async () => {
        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={study} />)

        await waitFor(() => {
            expect(screen.getByText('What is the effect of X on Y?')).toBeInTheDocument()
        })

        expect(screen.getByText('Test Study Title')).toBeInTheDocument()
        expect(screen.getByText('Research question(s)')).toBeInTheDocument()
        expect(screen.getByText('Project summary')).toBeInTheDocument()
        expect(screen.getByText('This study examines the relationship between X and Y.')).toBeInTheDocument()
        expect(screen.getByText('Impact')).toBeInTheDocument()
        expect(screen.getByText('This could improve treatment outcomes.')).toBeInTheDocument()
        expect(screen.getByText('Additional notes or requests')).toBeInTheDocument()
        expect(screen.getByText('Funding secured from NIH.')).toBeInTheDocument()
        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
        expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
        expect(screen.getByText('Dataset(s) of interest')).toBeInTheDocument()
        expect(screen.getByText('Dataset A')).toBeInTheDocument()
        expect(screen.getByText('Dataset B')).toBeInTheDocument()
    })

    it('shows approval status with date', () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const, approvedAt: new Date('2025-06-15T12:00:00') }

        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={approvedStudy} />)

        expect(screen.getByText('Approved on Jun 15, 2025')).toBeInTheDocument()
    })

    it('shows rejection status with date', () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const, rejectedAt: new Date('2025-06-15T12:00:00') }

        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={rejectedStudy} />)

        expect(screen.getByText('Rejected on Jun 15, 2025')).toBeInTheDocument()
    })

    it('shows Proceed to Step 3 button when agreementsHref is provided', () => {
        renderWithProviders(
            <ResearcherProposalView orgSlug="test-org" study={study} agreementsHref="/test-org/study/123/agreements" />,
        )

        expect(screen.getByRole('button', { name: 'Proceed to Step 3' })).toBeInTheDocument()
    })

    it('does not show Proceed to Step 3 button when agreementsHref is omitted', () => {
        renderWithProviders(<ResearcherProposalView orgSlug="test-org" study={study} />)

        expect(screen.queryByRole('button', { name: 'Proceed to Step 3' })).not.toBeInTheDocument()
    })
})
