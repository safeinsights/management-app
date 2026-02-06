import { type SelectedStudy } from '@/server/actions/study.actions'
import { renderWithProviders, screen, mockSessionWithTestData, faker } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { ProposalReviewView } from './proposal-review-view'

vi.mock('./proposal-review-buttons', () => ({
    ProposalReviewButtons: () => <div data-testid="proposal-review-buttons" />,
}))

vi.mock('@/components/researcher-profile-popover', () => ({
    ResearcherProfilePopover: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="researcher-popover">{children}</div>
    ),
}))

vi.mock('@/components/study/study-approval-status', () => ({
    default: () => <div data-testid="study-approval-status" />,
}))

vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => <div data-testid="org-breadcrumbs" />,
}))

const testStudyId = faker.string.uuid()

const makeStudy = (overrides: Partial<SelectedStudy> = {}): SelectedStudy =>
    ({
        id: testStudyId,
        title: 'Test Study Title',
        status: 'PENDING-REVIEW' as const,
        researcherId: 'user-1',
        createdBy: 'Jane Researcher',
        piName: 'Dr. Smith',
        dataSources: ['Dataset A', 'Dataset B'],
        researchQuestions: 'What is the effect of X on Y?',
        projectSummary: 'This study examines the relationship between X and Y.',
        impact: 'This could improve treatment outcomes.',
        additionalNotes: 'Funding secured from NIH.',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'test',
        irbProtocols: null,
        outputMimeType: 'text/csv',
        language: 'R',
        reviewerId: null,
        reviewerName: null,
        orgId: 'org-1',
        submittedByOrgId: 'org-1',
        latestJobStatuses: [],
        ...overrides,
    }) as SelectedStudy

describe('ProposalReviewView', () => {
    it('renders study title', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={makeStudy()} />)

        expect(screen.getByText('Test Study Title')).toBeInTheDocument()
    })

    it('renders proposal fields', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={makeStudy()} />)

        expect(screen.getByText('Research question(s)')).toBeInTheDocument()
        expect(screen.getByText('What is the effect of X on Y?')).toBeInTheDocument()
        expect(screen.getByText('Project summary')).toBeInTheDocument()
        expect(screen.getByText('This study examines the relationship between X and Y.')).toBeInTheDocument()
        expect(screen.getByText('Impact')).toBeInTheDocument()
        expect(screen.getByText('This could improve treatment outcomes.')).toBeInTheDocument()
        expect(screen.getByText('Additional notes')).toBeInTheDocument()
        expect(screen.getByText('Funding secured from NIH.')).toBeInTheDocument()
        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
        expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    })

    it('hides fields when values are null', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const study = makeStudy({
            researchQuestions: null,
            projectSummary: null,
            impact: null,
            additionalNotes: null,
            piName: '',
        })
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.queryByText('Research question(s)')).not.toBeInTheDocument()
        expect(screen.queryByText('Project summary')).not.toBeInTheDocument()
        expect(screen.queryByText('Impact')).not.toBeInTheDocument()
        expect(screen.queryByText('Additional notes')).not.toBeInTheDocument()
        expect(screen.queryByText('Principal Investigator')).not.toBeInTheDocument()
    })

    it('renders data sources', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={makeStudy()} />)

        expect(screen.getByText('Dataset(s) of interest')).toBeInTheDocument()
        expect(screen.getByText('Dataset A, Dataset B')).toBeInTheDocument()
    })

    it('renders "View full profile" link', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={makeStudy()} />)

        expect(screen.getByText('View full profile')).toBeInTheDocument()
    })
})
