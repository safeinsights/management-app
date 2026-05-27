import { lexicalJson } from '@/lib/lexical'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
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
import { LegacyProposalReviewView } from './legacy-proposal-review-view'

describe('LegacyProposalReviewView', () => {
    let study: Submitted<SelectedStudy>

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
            piName: 'Dr. Smith',
            datasets: ['Dataset A', 'Dataset B'],
            researchQuestions: lexicalJson('What is the effect of X on Y?'),
            projectSummary: lexicalJson('This study examines the relationship between X and Y.'),
            impact: lexicalJson('This could improve treatment outcomes.'),
            additionalNotes: lexicalJson('Funding secured from NIH.'),
        })
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: study.id })
    })

    it('renders proposal fields', async () => {
        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={study} />)

        await waitFor(() => {
            expect(screen.getByText('What is the effect of X on Y?')).toBeInTheDocument()
        })

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
        expect(screen.getByText('Researcher')).toBeInTheDocument()
        expect(screen.getByText(study.createdBy)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reject request' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Approve request' })).toBeInTheDocument()
    })

    it('hides fields when values are null', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            piName: '',
        })
        const nullStudy = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(nullStudy)) throw new Error('test fixture must be a submitted study')
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: nullStudy.id })

        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={nullStudy} />)

        expect(screen.queryByText('Research question(s)')).not.toBeInTheDocument()
        expect(screen.queryByText('Project summary')).not.toBeInTheDocument()
        expect(screen.queryByText('Impact')).not.toBeInTheDocument()
        expect(screen.queryByText('Additional notes or requests')).not.toBeInTheDocument()
        expect(screen.queryByText('Principal Investigator')).not.toBeInTheDocument()
    })

    it('renders Lexical JSON content as text', async () => {
        const lexicalQuestion = lexicalJson('Lexical formatted question')
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            researchQuestions: lexicalQuestion,
            piName: 'Dr. Jones',
        })
        const lexicalStudy = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(lexicalStudy)) throw new Error('test fixture must be a submitted study')
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: lexicalStudy.id })

        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={lexicalStudy} />)

        await waitFor(() => {
            expect(screen.getByText('Lexical formatted question')).toBeInTheDocument()
        })
        expect(screen.getByText('Dr. Jones')).toBeInTheDocument()
    })

    it('shows approval status when study is APPROVED', () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const, approvedAt: new Date('2025-06-15T12:00:00') }

        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={approvedStudy} />)

        expect(screen.getByText('Approved on Jun 15, 2025')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject request' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument()
    })

    it('shows rejection status when study is REJECTED', () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const, rejectedAt: new Date('2025-06-15T12:00:00') }

        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={rejectedStudy} />)

        expect(screen.getByText('Rejected on Jun 15, 2025')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject request' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument()
    })

    it('hides proposal review buttons when study is CHANGE-REQUESTED', () => {
        const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }

        renderWithProviders(<LegacyProposalReviewView orgSlug="test-org" study={clarificationStudy} />)

        expect(screen.queryByRole('button', { name: 'Reject request' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument()
    })

    it('renders "Proceed to Step 2" when agreementsHref is provided', () => {
        const agreementsHref = '/openstax/study/123/agreements'

        renderWithProviders(
            <LegacyProposalReviewView orgSlug="openstax" study={study} agreementsHref={agreementsHref} />,
        )

        expect(screen.getByRole('button', { name: 'Proceed to Step 2' })).toBeInTheDocument()
    })
})
