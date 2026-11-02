import type { StudyJobStatus, StudyStatus } from '@/database/types'
import type { Org } from '@/schema/org'
import {
    createTestQueryClient,
    db,
    faker,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { ExternalLinks, Routes } from '@/lib/routes'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudiesTable } from './index'

// A signed-in member of `audience`'s org, plus the org on the other side of its studies.
const signInAs = async (audience: 'reviewer' | 'researcher') => {
    const { org, user } = await mockSessionWithTestData({ orgType: audience === 'reviewer' ? 'enclave' : 'lab' })
    const other = await insertTestOrg({
        slug: faker.string.alpha(10),
        type: audience === 'reviewer' ? 'lab' : 'enclave',
    })
    const [enclave, lab] = audience === 'reviewer' ? [org, other] : [other, org]
    return { user, orgSlug: org.slug, enclave, lab }
}

type StudyOptions = {
    title?: string | null
    status?: StudyStatus
    researcherId?: string
    lastUpdatedAt?: Date
}

// A study the enclave reviews for the lab. With no job rows, a row's Last updated is lastUpdatedAt.
const insertStudy = async (
    { enclave, lab }: { enclave: Org; lab: Org },
    { title = 'Study Title 1', status = 'PENDING-REVIEW', researcherId, lastUpdatedAt }: StudyOptions = {},
) => {
    const { study } = await insertTestStudyOnly({
        org: enclave,
        submittedByOrg: lab,
        title: title ?? undefined,
        status,
        researcherId,
    })
    if (title === null || lastUpdatedAt) {
        await db
            .updateTable('study')
            .set({ ...(title === null ? { title: null } : {}), ...(lastUpdatedAt ? { lastUpdatedAt } : {}) })
            .where('id', '=', study.id)
            .execute()
    }
    return study
}

const insertStudyWithJob = (
    { enclave, lab }: { enclave: Org; lab: Org },
    studyStatus: StudyStatus,
    jobStatus: StudyJobStatus,
) => insertTestStudyJobData({ org: enclave, submittedByOrg: lab, studyStatus, jobStatus, title: 'Study Title 1' })

describe('Studies Table', () => {
    it('keeps the header, intro and data partner empty state with its docs link', async () => {
        const { orgSlug } = await signInAs('reviewer')
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug={orgSlug}
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
        const { orgSlug } = await signInAs('researcher')
        renderWithProviders(
            <StudiesTable audience="researcher" scope="org" orgSlug={orgSlug} title="All studies" paperWrapper />,
        )

        expect(await screen.findByText(/Every study follows four steps/)).toBeDefined()
        expect(screen.getByRole('link', { name: /Learn how to set up a study/ })).toHaveAttribute(
            'href',
            ExternalLinks.studyLifecycle,
        )
    })

    it('shows the intro only once a study is past draft', async () => {
        const orgs = await signInAs('researcher')
        await insertStudy(orgs, { status: 'DRAFT' })
        const renderTable = () =>
            renderWithProviders(
                <StudiesTable
                    audience="researcher"
                    scope="org"
                    orgSlug={orgs.orgSlug}
                    title="All studies"
                    description="Intro text"
                    paperWrapper
                />,
            )
        const { unmount } = renderTable()
        await screen.findByRole('link', { name: 'Study Title 1' })
        expect(screen.queryByText('Intro text')).toBeNull()
        unmount()

        await insertStudy(orgs, { title: 'Study Title 2' })
        renderTable()
        expect(await screen.findByText('Intro text')).toBeDefined()
    })

    it('links an untitled draft by a visible name', async () => {
        const orgs = await signInAs('researcher')
        const study = await insertStudy(orgs, { status: 'DRAFT', title: null })
        renderWithProviders(<StudiesTable audience="researcher" scope="org" orgSlug={orgs.orgSlug} paperWrapper />)

        const link = await screen.findByRole('link', { name: 'Untitled study' })
        expect(link).toHaveAttribute('href', Routes.studyEdit({ orgSlug: orgs.orgSlug, studyId: study.id }))
    })

    it('offers the draft author the delete-draft bin', async () => {
        const orgs = await signInAs('researcher')
        await insertStudy(orgs, { status: 'DRAFT', researcherId: orgs.user.id })
        renderWithProviders(<StudiesTable audience="researcher" scope="org" orgSlug={orgs.orgSlug} paperWrapper />)

        expect(await screen.findByLabelText('Delete draft study Study Title 1')).toBeDefined()
    })

    it('does not duplicate the new study button on an empty lab org dashboard', async () => {
        const { orgSlug } = await signInAs('researcher')
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug={orgSlug}
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
        const { orgSlug } = await signInAs('reviewer')
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug={orgSlug} title="Studies for review" paperWrapper />,
        )

        await screen.findByText(/Studies require your review at three stages/)
        expect(screen.queryByTestId('new-study')).toBeNull()
    })

    it('surfaces the query error message when loading fails', async () => {
        await signInAs('reviewer')
        // An org the session is not a member of, which the server refuses.
        const stranger = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug={stranger.slug}
                title="Studies for review"
                paperWrapper
            />,
        )

        expect(await screen.findByText(/Failed to load studies: .*permission/i)).toBeDefined()
        expect(screen.getByText('Studies for review')).toBeDefined()
    })

    it('renders the new columns without a Details column', async () => {
        const orgs = await signInAs('reviewer')
        await insertStudy(orgs)
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug={orgs.orgSlug}
                title="Studies for review"
                paperWrapper
            />,
        )

        await screen.findByRole('link', { name: 'Study Title 1' })
        const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
        expect(headers).toEqual(['Study title', 'Last updated', 'Submitted from', 'Reviewed by', 'Status'])
        expect(screen.queryByRole('link', { name: 'View' })).toBeNull()
    })

    it('renders the refresher in its own slot, outside the card header row', async () => {
        const orgs = await signInAs('reviewer')
        // A run in progress, so the refresher has something to wait for.
        await insertStudyWithJob(orgs, 'APPROVED', 'JOB-PACKAGING')
        // The refresher's width changes between states, so it stays out of the title row.
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug={orgs.orgSlug}
                title="Studies for review"
                showRefresher
                paperWrapper
            />,
        )

        const slot = await screen.findByTestId('refresher-slot')
        expect(await within(slot).findByText(/seconds until refresh/i)).toBeDefined()
        const headerRow = screen.getByText('Studies for review').parentElement as HTMLElement
        expect(headerRow.contains(slot)).toBe(false)
    })

    describe('sorting', () => {
        const insertDated = async () => {
            const orgs = await signInAs('reviewer')
            await insertStudy(orgs, { title: 'cherry', lastUpdatedAt: new Date('2026-01-01') })
            await insertStudy(orgs, { title: 'apple', lastUpdatedAt: new Date('2026-03-01') })
            await insertStudy(orgs, { title: 'Banana', lastUpdatedAt: new Date('2026-02-01') })
            return orgs.orgSlug
        }
        const titles = () => screen.getAllByRole('link', { name: /apple|Banana|cherry/ }).map((a) => a.textContent)
        const renderTable = (orgSlug: string) =>
            renderWithProviders(
                <StudiesTable
                    audience="reviewer"
                    scope="org"
                    orgSlug={orgSlug}
                    title="Studies for review"
                    paperWrapper
                />,
            )

        it('opens newest first with Last updated marked descending', async () => {
            renderTable(await insertDated())

            await screen.findByRole('link', { name: 'apple' })
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
            expect(screen.getByRole('columnheader', { name: /Study title/ })).not.toHaveAttribute('aria-sort')
        })

        it('sorts by a header button, flips on a second click, and opens Last updated newest first', async () => {
            const user = userEvent.setup()
            renderTable(await insertDated())
            await screen.findByRole('link', { name: 'apple' })

            await user.click(screen.getByRole('button', { name: /Study title/ }))
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Study title/ })).toHaveAttribute('aria-sort', 'ascending')

            await user.click(screen.getByRole('button', { name: /Study title/ }))
            expect(titles()).toEqual(['cherry', 'Banana', 'apple'])

            await user.click(screen.getByRole('button', { name: /Last updated/ }))
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
        })

        it('sorts Last updated oldest first on a second click', async () => {
            const user = userEvent.setup()
            renderTable(await insertDated())
            await screen.findByRole('link', { name: 'apple' })

            await user.click(screen.getByRole('button', { name: /Last updated/ }))
            expect(titles()).toEqual(['cherry', 'Banana', 'apple'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute('aria-sort', 'ascending')

            await user.click(screen.getByRole('button', { name: /Last updated/ }))
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
        })

        it('does not keep a sort after the table remounts', async () => {
            const user = userEvent.setup()
            const orgSlug = await insertDated()
            const { unmount } = renderTable(orgSlug)
            await screen.findByRole('link', { name: 'apple' })
            await user.click(screen.getByRole('button', { name: /Study title/ }))
            await user.click(screen.getByRole('button', { name: /Study title/ }))
            unmount()

            renderTable(orgSlug)
            await screen.findByRole('link', { name: 'apple' })
            expect(titles()).toEqual(['apple', 'Banana', 'cherry'])
            expect(screen.getByRole('columnheader', { name: /Last updated/ })).toHaveAttribute(
                'aria-sort',
                'descending',
            )
        })
    })

    it('keeps auto-refresh active for a researcher PENDING-REVIEW proposal with no jobs', async () => {
        const orgs = await signInAs('researcher')
        await insertStudy(orgs, { status: 'PENDING-REVIEW' })
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug={orgs.orgSlug}
                title="All studies"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/seconds until refresh/i)).toBeDefined()
        expect(screen.queryByText(/Reload inactive/i)).toBeNull()
    })

    it('does not auto-refresh a reviewer PENDING-REVIEW proposal with no jobs', async () => {
        const orgs = await signInAs('reviewer')
        await insertStudy(orgs, { status: 'PENDING-REVIEW' })
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug={orgs.orgSlug}
                title="Studies for review"
                showRefresher
                paperWrapper
            />,
        )

        await screen.findByRole('link', { name: 'Study Title 1' })
        expect(screen.getByText(/Reload inactive, nothing needs refreshing/i)).toBeDefined()
    })

    it('stops auto-refresh once every study is in a final state', async () => {
        const orgs = await signInAs('researcher')
        await insertStudyWithJob(orgs, 'APPROVED', 'FILES-APPROVED')
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug={orgs.orgSlug}
                title="All studies"
                showRefresher
                paperWrapper
            />,
        )

        await screen.findByRole('link', { name: 'Study Title 1' })
        expect(screen.getByText(/Reload inactive, nothing needs refreshing/i)).toBeDefined()
    })

    // The table owns its scope's dot, so a fetch patches that one org and refetches nothing (OTTER-838).
    describe('side nav dot', () => {
        const renderWithNav = async (openedAt: Date | null, isOrgMarked: boolean) => {
            const orgs = await signInAs('reviewer')
            const study = await insertStudy(orgs)
            if (openedAt) {
                await db
                    .insertInto('studyLastOpened')
                    .values({ studyId: study.id, userId: orgs.user.id, openedAt })
                    .execute()
            }
            const navKey = ['nav-unread', orgs.user.id]
            const queryClient = createTestQueryClient()
            queryClient.setQueryData(navKey, {
                myStudies: { researcher: true, reviewer: false },
                orgSlugs: isOrgMarked ? ['other-org', orgs.orgSlug] : ['other-org'],
            })
            renderWithProviders(<StudiesTable audience="reviewer" scope="org" orgSlug={orgs.orgSlug} />, {
                queryClient,
            })
            const navOrgs = () => queryClient.getQueryData<{ orgSlugs: string[] }>(navKey)?.orgSlugs
            return { orgSlug: orgs.orgSlug, queryClient, navKey, navOrgs }
        }

        it('marks its own org for an unopened row, without refetching the nav', async () => {
            const { orgSlug, queryClient, navKey, navOrgs } = await renderWithNav(null, false)

            await waitFor(() => expect(navOrgs()).toEqual(['other-org', orgSlug]))
            expect(queryClient.getQueryData(navKey)).toMatchObject({ myStudies: { researcher: true, reviewer: false } })
            expect(queryClient.getQueryState(navKey)?.isInvalidated).toBe(false)
        })

        it('clears only its own org once every row is opened', async () => {
            const { navOrgs } = await renderWithNav(new Date(Date.now() + 60_000), true)

            await waitFor(() => expect(navOrgs()).toEqual(['other-org']))
        })
    })
})
