import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { ExternalLinks } from '@/lib/routes'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudiesTable } from './index'

import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'

vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

vi.mock('@/components/spy-mode-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/components/spy-mode-context')>()),
    useSpyMode: () => ({ isSpyMode: false, toggleSpyMode: vi.fn() }),
}))

const mockStudies = [
    {
        id: '11111111-1111-4111-8111-111111111111',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        submittedAt: new Date(),
        lastUpdatedAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-1',
        outputMimeType: null,
        piName: 'PI Name 1',
        researcherId: 'researcher-1',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 1',
        createdBy: 'Person A',
        jobStatusChanges: [{ status: 'JOB-PACKAGING' as StudyJobStatus, userId: null }],
        latestStudyJobId: 'job-1',
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: '22222222-2222-4222-8222-222222222222',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location2',
        createdAt: new Date(),
        submittedAt: new Date(),
        lastUpdatedAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-2',
        outputMimeType: null,
        piName: 'PI Name 2',
        researcherId: 'researcher-2',
        status: 'APPROVED' as StudyStatus,
        title: 'Study Title 2',
        createdBy: 'Person B',
        reviewerName: 'Reviewer A',
        latestStudyJobId: 'job-2',
        jobStatusChanges: [{ status: 'RUN-COMPLETE' as StudyJobStatus, userId: null }],
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: '33333333-3333-4333-8333-333333333333',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location3',
        createdAt: new Date(),
        submittedAt: new Date(),
        lastUpdatedAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-3',
        outputMimeType: null,
        piName: 'PI Name 3',
        researcherId: 'researcher-3',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 3',
        createdBy: 'Person C',
        latestStudyJobId: null,
        jobStatusChanges: [],
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
]

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForOrgAction: vi.fn(() => mockStudies),
}))

// mockResolvedValueOnce is strict and the action's return type is much wider than the fixtures.
type OrgStudies = Awaited<ReturnType<typeof fetchStudiesForOrgAction>>

// Casts to the action's wider return type in one place, since mockResolvedValueOnce is strict.
const orgStudies = (...overrides: Array<Partial<(typeof mockStudies)[number]>>): OrgStudies =>
    overrides.map((o) => ({ ...mockStudies[0], ...o })) as unknown as OrgStudies

beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: {
            id: 'test-clerk-user-id',
            firstName: 'Tester',
            publicMetadata: {
                format: 'v3',
                user: { id: 'test-user-id' },
                teams: null,
                orgs: {
                    'test-org': {
                        id: 'test-org-id',
                        slug: 'test-org',
                        type: 'enclave',
                        isAdmin: false,
                    },
                },
            },
            unsafeMetadata: {
                currentOrgSlug: 'test-org',
            },
        },
    } as unknown as UseUserReturn)
})

describe('Studies Table', () => {
    it('keeps the header, intro and data partner empty state with its docs link', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Studies for review"
                description="Intro text"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/Studies require your review at three stages/)).toBeDefined()
        expect(screen.getByRole('columnheader', { name: /Study title/ })).toBeDefined()
        const link = screen.getByRole('link', { name: /Learn more about the review process/ })
        expect(link).toHaveAttribute('href', ExternalLinks.reviewProcess)
        expect(link).toHaveAttribute('target', '_blank')
        expect(screen.getByText('Intro text')).toBeDefined()
    })

    it('shows the research lab empty state with its docs link', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable audience="researcher" scope="org" orgSlug="test-org" title="All studies" paperWrapper />,
        )

        expect(await screen.findByText(/Every study follows four steps/)).toBeDefined()
        expect(screen.getByRole('link', { name: /Learn how to set up a study/ })).toHaveAttribute(
            'href',
            ExternalLinks.studyLifecycle,
        )
    })

    it('shows the intro only once a study is past draft', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(orgStudies({ status: 'DRAFT' as StudyStatus }))
        const { unmount } = renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="All studies"
                description="Intro text"
                paperWrapper
            />,
        )
        await screen.findByRole('link', { name: 'Study Title 1' })
        expect(screen.queryByText('Intro text')).toBeNull()
        unmount()

        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(
            orgStudies({ status: 'DRAFT' as StudyStatus }, { id: '22222222-2222-4222-8222-222222222222' }),
        )
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="All studies"
                description="Intro text"
                paperWrapper
            />,
        )
        expect(await screen.findByText('Intro text')).toBeDefined()
    })

    it('links an untitled draft by a visible name', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(
            orgStudies({ status: 'DRAFT' as StudyStatus, title: null as unknown as string }),
        )
        renderWithProviders(<StudiesTable audience="researcher" scope="org" orgSlug="test-org" paperWrapper />)

        const link = await screen.findByRole('link', { name: 'Untitled study' })
        expect(link).toHaveAttribute('href', '/test-org/study/11111111-1111-4111-8111-111111111111/edit')
    })

    it('does not duplicate the new study button on an empty lab org dashboard', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="All studies"
                showNewStudyButton
                paperWrapper
            />,
        )

        await screen.findByText(/Every study follows four steps/)
        expect(screen.getAllByTestId('new-study')).toHaveLength(1)
        expect(screen.getByTestId('new-study')).toHaveTextContent('New study')
    })

    it('does not show the new study button on an empty enclave org dashboard', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Studies for review" paperWrapper />,
        )

        await screen.findByText(/Studies require your review at three stages/)
        expect(screen.queryByTestId('new-study')).toBeNull()
    })

    it('surfaces the query error message when loading fails', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockRejectedValueOnce(new Error('boom'))
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Studies for review" paperWrapper />,
        )

        expect(await screen.findByText(/Failed to load studies: .*boom/i)).toBeDefined()
        expect(screen.getByText('Studies for review')).toBeDefined()
    })

    it('renders the new columns without a Details column', async () => {
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Studies for review" paperWrapper />,
        )

        await screen.findByRole('link', { name: 'Study Title 1' })
        const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
        expect(headers).toEqual(['Study title', 'Last updated', 'Submitted from', 'Reviewed by', 'Status'])
        expect(screen.queryByRole('link', { name: 'View' })).toBeNull()
    })

    it('renders the refresher in its own slot, outside the card header row', async () => {
        // The refresher's width changes between states, so it stays out of the title row.
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Studies for review"
                showRefresher
                paperWrapper
            />,
        )

        const slot = await screen.findByTestId('refresher-slot')
        expect(within(slot).getByText(/seconds until refresh/i)).toBeDefined()
        const headerRow = screen.getByText('Studies for review').parentElement as HTMLElement
        expect(headerRow.contains(slot)).toBe(false)
    })

    describe('sorting', () => {
        const dated = () =>
            orgStudies(
                { id: '11111111-1111-4111-8111-111111111111', title: 'cherry', lastUpdatedAt: new Date('2026-01-01') },
                { id: '22222222-2222-4222-8222-222222222222', title: 'apple', lastUpdatedAt: new Date('2026-03-01') },
                { id: '33333333-3333-4333-8333-333333333333', title: 'Banana', lastUpdatedAt: new Date('2026-02-01') },
            )
        const titles = () => screen.getAllByRole('link', { name: /apple|Banana|cherry/ }).map((a) => a.textContent)
        const renderTable = () =>
            renderWithProviders(
                <StudiesTable
                    audience="reviewer"
                    scope="org"
                    orgSlug="test-org"
                    title="Studies for review"
                    paperWrapper
                />,
            )

        it('opens newest first with Last updated marked descending', async () => {
            vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(dated())
            renderTable()

            await screen.findByRole('link', { name: 'apple' })
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
            expect(screen.getByRole('columnheader', { name: /Study title/ })).not.toHaveAttribute('aria-sort')
        })

        it('sorts by a header button, flips on a second click, and returns to the default from Last updated', async () => {
            const user = userEvent.setup()
            vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(dated())
            renderTable()
            await screen.findByRole('link', { name: 'apple' })

            await user.click(screen.getByRole('button', { name: /Study title/ }))
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Study title/ })).toHaveAttribute('aria-sort', 'ascending')

            await user.click(screen.getByRole('button', { name: /Study title/ }))
            expect(titles()).toEqual(['cherry', 'Banana', 'apple'])

            await user.click(screen.getByRole('button', { name: /Last updated/ }))
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
        })

        it('does not keep a sort after the table remounts', async () => {
            const user = userEvent.setup()
            vi.mocked(fetchStudiesForOrgAction).mockResolvedValue(dated())
            const { unmount } = renderTable()
            await screen.findByRole('link', { name: 'apple' })
            await user.click(screen.getByRole('button', { name: /Study title/ }))
            await user.click(screen.getByRole('button', { name: /Study title/ }))
            unmount()

            renderTable()
            await screen.findByRole('link', { name: 'apple' })
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
        })
    })

    it('keeps auto-refresh active for a researcher PENDING-REVIEW proposal with no jobs', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(
            orgStudies({ status: 'PENDING-REVIEW' as StudyStatus, jobStatusChanges: [] }),
        )
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="All studies"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/seconds until refresh/i)).toBeDefined()
        expect(screen.queryByText(/Reload inactive/i)).toBeNull()
    })

    it('does not auto-refresh a reviewer PENDING-REVIEW proposal with no jobs', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(
            orgStudies({ status: 'PENDING-REVIEW' as StudyStatus, jobStatusChanges: [] }),
        )
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Studies for review"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/Reload inactive, nothing needs refreshing/i)).toBeDefined()
    })

    it('stops auto-refresh once every study is in a final state', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce(
            orgStudies({
                status: 'APPROVED' as StudyStatus,
                jobStatusChanges: [{ status: 'FILES-APPROVED' as StudyJobStatus, userId: null }],
            }),
        )
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="All studies"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/Reload inactive, nothing needs refreshing/i)).toBeDefined()
    })
})
