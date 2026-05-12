import { lexicalJson } from '@/lib/word-count'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProposalSection } from './proposal-section'

describe('ProposalSection', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
            piName: 'Dr. Smith',
            datasets: ['Dataset A'],
            researchQuestions: lexicalJson('What is the effect of X on Y?'),
            projectSummary: lexicalJson('This study examines X and Y.'),
            impact: lexicalJson('This could improve outcomes.'),
            additionalNotes: lexicalJson('Funded by NIH.'),
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: study.id })
    })

    it('renders the section header with step label and heading', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByText('STEP 1')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Review initial request' })).toBeInTheDocument()
    })

    it('renders the study title in the header', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByText(/Title: Test Study Title/)).toBeInTheDocument()
    })

    it('renders all proposal fields with correct labels', async () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        await waitFor(() => {
            expect(screen.getByText('What is the effect of X on Y?')).toBeInTheDocument()
        })

        expect(screen.getByText('Dataset(s) of interest')).toBeInTheDocument()
        expect(screen.getByText('Research question(s)')).toBeInTheDocument()
        expect(screen.getByText('Project summary')).toBeInTheDocument()
        expect(screen.getByText('This study examines X and Y.')).toBeInTheDocument()
        expect(screen.getByText('Impact')).toBeInTheDocument()
        expect(screen.getByText('This could improve outcomes.')).toBeInTheDocument()
        expect(screen.getByText('Additional notes or requests')).toBeInTheDocument()
        expect(screen.getByText('Funded by NIH.')).toBeInTheDocument()
        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
        expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
        expect(screen.getByText('Researcher')).toBeInTheDocument()
    })

    it('renders the status banner with evaluation criteria', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        const banner = screen.getByTestId('status-banner')
        expect(banner).toBeInTheDocument()
        expect(banner).toHaveTextContent('has submitted an initial request requesting permission to use your data')
        expect(screen.getByTestId('evaluation-criteria')).toBeInTheDocument()
        expect(screen.getByText(/Feasibility:/)).toBeInTheDocument()
        expect(screen.getByText(/Can this study be supported with your available data/)).toBeInTheDocument()
        expect(screen.getByText(/Could the results advance the understanding/)).toBeInTheDocument()
        expect(screen.getByText(/Does the researcher have relevant expertise/)).toBeInTheDocument()
    })

    it('shows the submitting lab name in the status banner', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        const labName = study.submittingLabName ?? study.submittedByOrgSlug
        expect(screen.getByTestId('status-banner')).toHaveTextContent(labName)
    })

    it('is expanded by default showing the proposal body', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByTestId('proposal-body')).toBeInTheDocument()
        expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('Hide full initial request')
        expect(screen.getByTestId('proposal-toggle-body')).toHaveTextContent('Hide full initial request')
    })

    it('collapses the proposal body when the header toggle is clicked', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        fireEvent.click(screen.getByTestId('proposal-toggle-header'))

        expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
    })

    it('toggles between hide and show text on repeated clicks', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        const headerToggle = screen.getByTestId('proposal-toggle-header')
        expect(headerToggle).toHaveTextContent('Hide full initial request')

        await user.click(headerToggle)
        expect(headerToggle).toHaveTextContent('View full initial request')

        await user.click(headerToggle)
        expect(headerToggle).toHaveTextContent('Hide full initial request')
    })

    it('opens the PI popover when the info icon is hovered', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
        await user.hover(screen.getByText('Dr. Smith'))

        // The PI in this fixture has no linked userId, so the popover shows the not-available state.
        await waitFor(() => {
            expect(screen.getByText('Profile not available')).toBeInTheDocument()
        })
    })

    it('opens the Researcher popover when the info icon is hovered', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByText('Researcher')).toBeInTheDocument()
        await user.hover(screen.getByText(study.createdBy))

        // Researcher has no detailed profile inserted, so popover shows the minimal-profile state.
        await waitFor(() => {
            expect(screen.getByText('This user has no detailed profile information')).toBeInTheDocument()
        })
    })

    it('renders submitted date when study has been submitted', () => {
        const submittedStudy = { ...study, submittedAt: new Date('2025-03-15T12:00:00Z') }

        renderWithProviders(<ProposalSection study={submittedStudy} orgSlug="test-org" />)

        expect(screen.getByText('Submitted on Mar 15, 2025')).toBeInTheDocument()
    })

    it('does not render submitted date when study has no submission date', () => {
        const unsubmittedStudy = { ...study, submittedAt: null }

        renderWithProviders(<ProposalSection study={unsubmittedStudy} orgSlug="test-org" />)

        expect(screen.queryByText(/Submitted on/)).not.toBeInTheDocument()
    })
})
