import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalReviewView } from './proposal-review-view'

vi.mock('@/components/readonly-lexical-content', () => ({
    ReadOnlyLexicalContent: ({ value }: { value: string }) => {
        try {
            const parsed = JSON.parse(value)
            if (typeof parsed === 'string') return <div>{parsed}</div>
            const text = parsed.root.children
                .map((node: { children: { text: string }[] }) =>
                    node.children.map((c: { text: string }) => c.text).join(''),
                )
                .join('\n')
            return <div>{text}</div>
        } catch {
            return <div>{value}</div>
        }
    },
}))

vi.mock('./proposal-review-buttons', () => ({
    ProposalReviewButtons: () => <div data-testid="proposal-review-buttons" />,
}))

vi.mock('@/components/researcher-profile-popover', () => ({
    ResearcherProfilePopover: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="researcher-popover">{children}</div>
    ),
}))

vi.mock('@/components/study/study-approval-status', () => ({
    default: ({ status, date }: { status: string; date?: Date | null }) =>
        date ? (
            <div data-testid="study-approval-status">
                {status} on {date.toISOString()}
            </div>
        ) : null,
}))

vi.mock('@/components/page-breadcrumbs', () => ({
    PageBreadcrumbs: () => <div data-testid="page-breadcrumbs" />,
}))

describe('ProposalReviewView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
            piName: 'Dr. Smith',
            datasets: ['Dataset A', 'Dataset B'],
            researchQuestions: JSON.stringify('What is the effect of X on Y?'),
            projectSummary: JSON.stringify('This study examines the relationship between X and Y.'),
            impact: JSON.stringify('This could improve treatment outcomes.'),
            additionalNotes: JSON.stringify('Funding secured from NIH.'),
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    })

    it('renders proposal fields', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByText('Research question(s)')).toBeInTheDocument()
        expect(screen.getByText('What is the effect of X on Y?')).toBeInTheDocument()
        expect(screen.getByText('Project summary')).toBeInTheDocument()
        expect(screen.getByText('This study examines the relationship between X and Y.')).toBeInTheDocument()
        expect(screen.getByText('Impact')).toBeInTheDocument()
        expect(screen.getByText('This could improve treatment outcomes.')).toBeInTheDocument()
        expect(screen.getByText('Additional notes or requests')).toBeInTheDocument()
        expect(screen.getByText('Funding secured from NIH.')).toBeInTheDocument()
        expect(screen.getByText('Principal Investigator')).toBeInTheDocument()
        expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
        expect(screen.getByText('Dataset(s) of interest')).toBeInTheDocument()
        expect(screen.getByText('Dataset A, Dataset B')).toBeInTheDocument()
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

        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={nullStudy} />)

        expect(screen.queryByText('Research question(s)')).not.toBeInTheDocument()
        expect(screen.queryByText('Project summary')).not.toBeInTheDocument()
        expect(screen.queryByText('Impact')).not.toBeInTheDocument()
        expect(screen.queryByText('Additional notes or requests')).not.toBeInTheDocument()
        expect(screen.queryByText('Principal Investigator')).not.toBeInTheDocument()
    })

    it('renders Lexical JSON content as text', async () => {
        const lexicalJson = JSON.stringify({
            root: {
                children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Lexical formatted question' }] }],
                type: 'root',
                direction: null,
                format: '',
                indent: 0,
                version: 1,
            },
        })
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            researchQuestions: lexicalJson,
            piName: 'Dr. Jones',
        })
        const lexicalStudy = actionResult(await getStudyAction({ studyId: dbStudy.id }))

        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={lexicalStudy} />)

        expect(screen.getByText('Lexical formatted question')).toBeInTheDocument()
        expect(screen.getByText('Dr. Jones')).toBeInTheDocument()
    })

    it('shows approval status when study is APPROVED', () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const, approvedAt: new Date('2025-06-15') }

        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={approvedStudy} />)

        expect(screen.getByTestId('study-approval-status')).toHaveTextContent('APPROVED')
    })

    it('shows rejection status when study is REJECTED', () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const, rejectedAt: new Date('2025-06-15') }

        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={rejectedStudy} />)

        expect(screen.getByTestId('study-approval-status')).toHaveTextContent('REJECTED')
    })
})
