import { lexicalJson } from '@/lib/lexical'
import { getStudyAction, type ProposalFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    within,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProposalSection } from './proposal-section'

// Fully typed so a cast cannot hide a partial object once ProposalRequest reads new fields.
const buildEntry = (overrides: Partial<ProposalFeedbackEntry> = {}): ProposalFeedbackEntry =>
    ({
        id: overrides.id ?? 'entry-1',
        authorId: overrides.authorId ?? 'author-1',
        authorName: overrides.authorName ?? 'Reviewer One',
        authorRole: overrides.authorRole ?? 'REVIEWER',
        entryType: overrides.entryType ?? 'REVIEWER-FEEDBACK',
        decision: overrides.decision === undefined ? 'NEEDS-CLARIFICATION' : overrides.decision,
        body: overrides.body ?? JSON.parse(lexicalJson('Entry body.')),
        createdAt: overrides.createdAt ?? new Date('2026-04-16T10:00:00Z'),
        version: overrides.version ?? 1,
    }) as ProposalFeedbackEntry

describe('ProposalSection', () => {
    let study: Submitted<SelectedStudy>

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
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
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

    it('shows resubmission copy and versioned heading when reviewVersion > 1', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" reviewVersion={2} />)

        expect(screen.getByRole('heading', { name: 'Review initial request v2.0' })).toBeInTheDocument()
        expect(screen.getByTestId('status-banner')).toHaveTextContent(
            'has resubmitted a revised initial request requesting permission to use your data',
        )
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

    it('shows the submitting lab name in the status banner, not bold', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        const labName = study.submittingLabName ?? study.submittedByOrgSlug
        const banner = screen.getByTestId('status-banner')
        expect(banner).toHaveTextContent(labName)

        for (const strong of banner.querySelectorAll('strong')) {
            expect(strong.textContent ?? '').not.toContain(labName)
        }
    })

    it('is expanded by default on first submission', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByTestId('proposal-body')).toBeInTheDocument()
        expect(screen.getByTestId('proposal-toggle-top')).toHaveTextContent('Hide full proposal')
        expect(screen.getByTestId('proposal-toggle-bottom')).toHaveTextContent('Hide full proposal')
    })

    it('is collapsed by default on resubmission', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" reviewVersion={2} />)

        expect(screen.getByTestId('proposal-toggle-snippet')).toHaveTextContent('View full proposal')
        expect(screen.queryByTestId('proposal-body')).not.toBeInTheDocument()
    })

    it('keeps the proposal toggle out of the status card', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 1')
        expect(within(header).queryByRole('button', { name: /full proposal/i })).not.toBeInTheDocument()
        expect(within(screen.getByTestId('proposal-card')).getByTestId('proposal-toggle-top')).toBeInTheDocument()
    })

    it('collapses to the snippet when the top toggle is clicked', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        fireEvent.click(screen.getByTestId('proposal-toggle-top'))

        expect(screen.getByTestId('proposal-toggle-snippet')).toHaveTextContent('View full proposal')
        expect(screen.queryByTestId('proposal-body')).not.toBeInTheDocument()
    })

    it('collapses to the snippet when the bottom toggle is clicked', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        fireEvent.click(screen.getByTestId('proposal-toggle-bottom'))

        expect(screen.getByTestId('proposal-snippet')).toBeInTheDocument()
        expect(screen.queryByTestId('proposal-body')).not.toBeInTheDocument()
    })

    it('toggles between the snippet and the full proposal on repeated clicks', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        await user.click(screen.getByTestId('proposal-toggle-top'))
        expect(screen.getByTestId('proposal-toggle-snippet')).toHaveAttribute('aria-expanded', 'false')

        await user.click(screen.getByTestId('proposal-toggle-snippet'))
        expect(screen.getByTestId('proposal-toggle-top')).toHaveAttribute('aria-expanded', 'true')
    })

    // The card swaps its content, so the clicked toggle is unmounted by the next render and
    // keyboard focus would land on the document body.
    it('hands focus to the toggle that replaces the one just clicked', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        await user.click(screen.getByTestId('proposal-toggle-top'))
        expect(screen.getByTestId('proposal-toggle-snippet')).toHaveFocus()

        await user.click(screen.getByTestId('proposal-toggle-snippet'))
        expect(screen.getByTestId('proposal-toggle-top')).toHaveFocus()
    })

    // The bottom toggle has no replacement below it, so the hand-off goes up to the snippet toggle.
    it('hands focus up to the snippet toggle when the card is collapsed from the bottom', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        await user.click(screen.getByTestId('proposal-toggle-bottom'))

        expect(screen.getByTestId('proposal-toggle-snippet')).toHaveFocus()
    })

    it('leaves focus alone until a toggle is used', () => {
        renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

        expect(screen.getByTestId('proposal-toggle-top')).not.toHaveFocus()
    })

    describe('collapsed snippet', () => {
        it('previews the datasets and the research question only', () => {
            renderWithProviders(<ProposalSection study={study} orgSlug="test-org" reviewVersion={2} />)

            const snippet = screen.getByTestId('proposal-snippet')
            expect(within(snippet).getByText('Dataset(s) of interest')).toBeInTheDocument()
            expect(within(snippet).getByText('Dataset A')).toBeInTheDocument()
            expect(within(snippet).getByTestId('proposal-snippet-question')).toHaveTextContent(
                'What is the effect of X on Y?',
            )

            expect(screen.queryByText('Project summary')).not.toBeInTheDocument()
            expect(screen.queryByText('Impact')).not.toBeInTheDocument()
            expect(screen.queryByText('Principal Investigator')).not.toBeInTheDocument()
            expect(screen.queryByText('Additional notes or requests')).not.toBeInTheDocument()
        })

        it('keeps a list-formatted research question readable in the preview', () => {
            const listQuestions = {
                root: {
                    type: 'root',
                    children: [
                        {
                            type: 'list',
                            listType: 'bullet',
                            children: [
                                { type: 'listitem', children: [{ type: 'text', text: 'First question?' }] },
                                { type: 'listitem', children: [{ type: 'text', text: 'Second question?' }] },
                            ],
                        },
                    ],
                },
            }
            const withListQuestions = { ...study, researchQuestions: listQuestions }

            renderWithProviders(<ProposalSection study={withListQuestions} orgSlug="test-org" reviewVersion={2} />)

            expect(screen.getByTestId('proposal-snippet-question')).toHaveTextContent(
                'First question? Second question?',
            )
        })

        it('clamps the research question preview to two lines', () => {
            renderWithProviders(<ProposalSection study={study} orgSlug="test-org" reviewVersion={2} />)

            // Mantine drives the clamp from a CSS variable, not a -webkit-line-clamp declaration
            // jsdom would see.
            const preview = screen.getByTestId('proposal-snippet-question')
            expect(preview).toHaveAttribute('data-line-clamp', 'true')
            expect(preview.style.getPropertyValue('--text-line-clamp')).toBe('2')
        })

        it('leaves no divider behind when the research question is absent', () => {
            const withoutQuestion = { ...study, researchQuestions: null }

            renderWithProviders(<ProposalSection study={withoutQuestion} orgSlug="test-org" reviewVersion={2} />)

            const snippet = screen.getByTestId('proposal-snippet')
            expect(within(snippet).queryByTestId('proposal-snippet-question')).not.toBeInTheDocument()
            expect(within(snippet).queryAllByRole('separator')).toHaveLength(0)
            expect(within(snippet).getByTestId('proposal-toggle-snippet')).toBeInTheDocument()
        })
    })

    describe('professional profile links', () => {
        it('links the researcher to their profile in a new tab', () => {
            renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

            const researcherRow = screen.getByText(study.createdBy).parentElement as HTMLElement
            const link = within(researcherRow).getByRole('link', { name: /Professional profile/ })

            expect(link).toHaveAttribute(
                'href',
                `/test-org/study/${study.id}/researcher-profile?userId=${study.researcherId}`,
            )
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })

        it('shows the PI name without a link when no PI user is recorded', () => {
            renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

            const piRow = screen.getByText('Dr. Smith').parentElement as HTMLElement
            expect(within(piRow).queryByRole('link')).not.toBeInTheDocument()
        })

        it('replaces the hover popover on the profile rows', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalSection study={study} orgSlug="test-org" />)

            await user.hover(screen.getByText(study.createdBy))

            // The removed popover had no accessible name on either trigger or dropdown, so the
            // Mantine class is the only way to assert it no longer opens.
            expect(document.querySelector('.mantine-Popover-dropdown')).toBeNull()
            expect(screen.getAllByRole('link', { name: /Professional profile/ })).toHaveLength(1)
        })
    })

    it('renders submitted date when study has been submitted', () => {
        const submittedStudy = { ...study, submittedAt: new Date('2025-03-15T12:00:00Z') }

        renderWithProviders(<ProposalSection study={submittedStudy} orgSlug="test-org" />)

        expect(screen.getByText('Submitted on Mar 15, 2025')).toBeInTheDocument()
    })

    it('renders the resubmission date (not the original submittedAt) on resubmission', () => {
        const submittedStudy = { ...study, submittedAt: new Date('2025-03-15T12:00:00Z') }
        const priorEntries = [
            buildEntry({
                version: 2,
                entryType: 'RESUBMISSION-NOTE',
                createdAt: new Date('2026-05-10T12:00:00Z'),
            }),
            buildEntry({
                id: 'entry-2',
                version: 1,
                entryType: 'REVIEWER-FEEDBACK',
                createdAt: new Date('2026-04-01T12:00:00Z'),
            }),
        ]

        renderWithProviders(
            <ProposalSection study={submittedStudy} orgSlug="test-org" priorEntries={priorEntries} reviewVersion={2} />,
        )

        expect(screen.getByText('Resubmitted on May 10, 2026')).toBeInTheDocument()
        expect(screen.queryByText(/Mar 15, 2025/)).not.toBeInTheDocument()
    })
})
