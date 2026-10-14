import {
    createTestQueryClient,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    faker,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    render,
    renderWithProviders,
    waitFor,
} from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { captureException } from '@sentry/nextjs'
import { useParams } from 'next/navigation'
import { MarkStudyOpened } from './mark-study-opened'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    captureException: vi.fn(),
}))

const onRoute = (params: { orgSlug: string; studyId?: string }) => (useParams as Mock).mockReturnValue(params)

const openedAt = async (studyId: string, userId: string) =>
    (
        await db
            .selectFrom('studyLastOpened')
            .select('openedAt')
            .where('studyId', '=', studyId)
            .where('userId', '=', userId)
            .executeTakeFirst()
    )?.openedAt

// The action's guards are covered in study.actions.test.ts. What only the leaf can show is that
// entering and leaving the study both write the stamp.
describe('MarkStudyOpened', () => {
    it('records the visit on entering and again on leaving the study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        onRoute({ orgSlug: org.slug, studyId: study.id })

        const { unmount } = renderWithProviders(<MarkStudyOpened />)
        await waitFor(async () => expect(await openedAt(study.id, user.id)).toBeInstanceOf(Date))
        const entered = (await openedAt(study.id, user.id))!

        unmount()

        await waitFor(async () =>
            expect((await openedAt(study.id, user.id))!.getTime()).toBeGreaterThan(entered.getTime()),
        )
    })

    // It lives in the app shell, which stays mounted while the route moves between studies.
    it('stamps the study left and the study entered when the route changes', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study: first } = await insertTestStudyJobData({ org, researcherId: user.id })
        const { study: second } = await insertTestStudyJobData({ org, researcherId: user.id })
        const queryClient = createTestQueryClient()
        onRoute({ orgSlug: org.slug, studyId: first.id })

        const { rerender, unmount } = render(<MarkStudyOpened />, { wrapper: createTestQueryWrapper({ queryClient }) })
        await waitFor(async () => expect(await openedAt(first.id, user.id)).toBeInstanceOf(Date))
        const entered = (await openedAt(first.id, user.id))!

        onRoute({ orgSlug: org.slug, studyId: second.id })
        rerender(<MarkStudyOpened />)

        await waitFor(async () => {
            expect((await openedAt(first.id, user.id))!.getTime()).toBeGreaterThan(entered.getTime())
            expect(await openedAt(second.id, user.id)).toBeInstanceOf(Date)
        })
        unmount()
        await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    })

    it('writes nothing on a route outside a study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        const queryClient = createTestQueryClient()
        onRoute({ orgSlug: org.slug })

        const { unmount } = renderWithProviders(<MarkStudyOpened />, { queryClient })
        unmount()

        expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
        expect(await openedAt(study.id, user.id)).toBeUndefined()
    })

    // Held until reconnect, the leave stamp would land late and mark as seen what changed meanwhile.
    it('writes the leave stamp while offline instead of holding it for reconnect', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        const queryClient = createTestQueryClient()
        onRoute({ orgSlug: org.slug, studyId: study.id })

        const { unmount } = renderWithProviders(<MarkStudyOpened />, { queryClient })
        await waitFor(async () => expect(await openedAt(study.id, user.id)).toBeInstanceOf(Date))
        const entered = (await openedAt(study.id, user.id))!

        window.dispatchEvent(new Event('offline'))
        unmount()

        await waitFor(async () =>
            expect((await openedAt(study.id, user.id))!.getTime()).toBeGreaterThan(entered.getTime()),
        )
        expect(queryClient.getMutationCache().getAll()).not.toContainEqual(
            expect.objectContaining({ state: expect.objectContaining({ isPaused: true }) }),
        )
        window.dispatchEvent(new Event('online'))
    })

    // Without this the dashboard and the side nav can show a dot for the study just left. Leaving
    // skips the nav: the dashboard it lands on patches its own dot.
    it('invalidates the tables on both stamps and the side nav on entering only', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        const queryClient = createTestQueryClient()
        const tableKeys = [
            ['researcher-studies', org.slug],
            ['user-reviewer-studies', user.id],
        ]
        const navKey = ['nav-unread', user.id]
        const prime = () => {
            tableKeys.forEach((key) => queryClient.setQueryData(key, []))
            queryClient.setQueryData(navKey, { myStudies: { researcher: true, reviewer: false }, orgSlugs: [] })
        }
        const isInvalidated = (key: string[]) => queryClient.getQueryState(key)?.isInvalidated
        prime()
        onRoute({ orgSlug: org.slug, studyId: study.id })

        const { unmount } = renderWithProviders(<MarkStudyOpened />, { queryClient })
        await waitFor(() => [...tableKeys, navKey].forEach((key) => expect(isInvalidated(key)).toBe(true)))
        await waitFor(() => expect(queryClient.isMutating()).toBe(0))

        prime()
        unmount()
        await waitFor(() => tableKeys.forEach((key) => expect(isInvalidated(key)).toBe(true)))
        await waitFor(() => expect(queryClient.isMutating()).toBe(0))
        expect(isInvalidated(navKey)).toBe(false)
    })

    // Otherwise a stamp that always fails leaves every dot lit with no trace.
    it('reports a failed stamp to Sentry', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const queryClient = createTestQueryClient()
        onRoute({ orgSlug: org.slug, studyId: faker.string.uuid() })

        const { unmount } = renderWithProviders(<MarkStudyOpened />, { queryClient })

        await waitFor(() => expect(captureException).toHaveBeenCalledWith(expect.any(Error)))
        unmount()
        await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    })
})
