import {
    act,
    createTestQueryClient,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    insertTestOrg,
    mockClerkSession,
    mockSessionWithTestData,
    faker,
    renderHook,
    renderWithProviders,
    screen,
    SessionOrgSlugs,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { notifications } from '@mantine/notifications'
import { SessionInfoProvider } from '@/components/layout/session-info-context'
import { findOrCreateOrgMembership } from '@/server/mutations'
import { CURRENT_USER_INFO_KEY, useReloadOrgList, useSession } from './session'

type TestQueryClient = ReturnType<typeof createTestQueryClient>

const serverInfoFor = (userId: string): UserInfo => ({
    format: 'v3',
    user: { id: userId },
    teams: null,
    orgs: { 'from-server': { id: faker.string.uuid(), slug: 'from-server', type: 'lab', isAdmin: false } },
})

// The test client turns refetching on mount and on focus off; the app's client leaves both on.
const appLikeQueryClient = () => {
    const client = createTestQueryClient()
    client.setDefaultOptions({
        queries: { ...client.getDefaultOptions().queries, refetchOnMount: true, refetchOnWindowFocus: true },
    })
    return client
}

const countFetches = (client: TestQueryClient) => {
    let count = 0
    client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'fetch') count++
    })
    return () => count
}

const orgList = () => screen.getByRole('status', { name: 'session orgs' })

const renderWithLayoutInfo = (userInfo: UserInfo | null, queryClient = appLikeQueryClient()) =>
    renderWithProviders(
        <SessionInfoProvider userInfo={userInfo}>
            <SessionOrgSlugs />
        </SessionInfoProvider>,
        { queryClient },
    )

const sessionOrgSlugs = (result: ReturnType<typeof useSession>) => Object.keys(result.session?.orgs ?? {}).sort()

describe('useSession', () => {
    it('uses the layout org list without asking the server', () => {
        const userId = faker.string.uuid()
        mockClerkSession({ clerkUserId: 'c1', userId, orgSlug: 'from-clerk', orgId: faker.string.uuid() })
        const queryClient = appLikeQueryClient()
        const fetches = countFetches(queryClient)

        renderWithLayoutInfo(serverInfoFor(userId), queryClient)

        expect(orgList()).toHaveTextContent('from-server')
        expect(fetches()).toBe(0)
    })

    // Server and client render the same markup before Clerk loads, so hydration matches.
    it('uses the layout org list while Clerk is still loading', () => {
        ;(useUser as Mock).mockReturnValue({ isLoaded: false, isSignedIn: undefined, user: undefined })

        renderWithLayoutInfo(serverInfoFor(faker.string.uuid()))

        expect(orgList()).toHaveTextContent('from-server')
    })

    it('uses the orgs in Clerk metadata the script has not slimmed yet, without asking the server', () => {
        mockClerkSession({ clerkUserId: 'c1', userId: faker.string.uuid(), orgSlug: 'from-clerk' })
        const queryClient = appLikeQueryClient()
        const fetches = countFetches(queryClient)

        renderWithLayoutInfo(null, queryClient)

        expect(orgList()).toHaveTextContent('from-clerk')
        expect(fetches()).toBe(0)
    })

    it('asks the server once for all consumers when the layout passes no list', async () => {
        const { org } = await mockSessionWithTestData({ slimMetadata: true })
        const queryClient = appLikeQueryClient()
        const fetches = countFetches(queryClient)

        renderWithProviders(
            <>
                <SessionOrgSlugs />
                <SessionOrgSlugs />
            </>,
            { queryClient },
        )

        const lists = screen.getAllByRole('status', { name: 'session orgs' })
        expect(lists.map((list) => list.textContent)).toEqual(['loading', 'loading'])
        await waitFor(() => expect(lists.map((list) => list.textContent)).toEqual([org.slug, org.slug]))
        expect(fetches()).toBe(1)
    })

    it('shows an org added after the first load once the org list is reloaded', async () => {
        const { user, org } = await mockSessionWithTestData({ slimMetadata: true })
        const { result } = renderHook(() => ({ session: useSession(), reloadOrgList: useReloadOrgList() }), {
            wrapper: createTestQueryWrapper(),
        })
        await waitFor(() => expect(sessionOrgSlugs(result.current.session)).toEqual([org.slug]))

        const joined = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await findOrCreateOrgMembership({ userId: user.id, slug: joined.slug })
        await act(() => result.current.reloadOrgList())

        await waitFor(() => expect(sessionOrgSlugs(result.current.session)).toEqual([org.slug, joined.slug].sort()))
    })

    it('loads the list of the account Clerk switches to and never shows the previous one', async () => {
        const first = await mockSessionWithTestData({ slimMetadata: true })
        const seen: string[][] = []
        const { result, rerender } = renderHook(
            () => {
                const current = useSession()
                seen.push(sessionOrgSlugs(current))
                return current
            },
            { wrapper: createTestQueryWrapper() },
        )
        await waitFor(() => expect(sessionOrgSlugs(result.current)).toEqual([first.org.slug]))

        const second = await mockSessionWithTestData({ slimMetadata: true })
        seen.length = 0
        rerender()

        await waitFor(() => expect(sessionOrgSlugs(result.current)).toEqual([second.org.slug]))
        expect(seen.flat()).not.toContain(first.org.slug)
    })

    it('reports once, and stays loading, when the server finds no session for a signed-in user', async () => {
        await mockSessionWithTestData({ slimMetadata: true })
        ;(clerkAuth as unknown as Mock).mockImplementation(() => ({ userId: null, sessionClaims: null }))

        renderWithProviders(
            <>
                <SessionOrgSlugs />
                <SessionOrgSlugs />
            </>,
        )

        await waitFor(() =>
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Failed to load your organizations' }),
            ),
        )
        expect(notifications.show).toHaveBeenCalledTimes(1)
        const lists = screen.getAllByRole('status', { name: 'session orgs' })
        expect(lists.map((list) => list.textContent)).toEqual(['loading', 'loading'])
    })

    // An errored query has no data, so it is stale: without opting out, each tab focus and each newly
    // mounted consumer would ask again and toast again.
    it('reports a missing server session once across a window focus and a later consumer', async () => {
        await mockSessionWithTestData({ slimMetadata: true })
        ;(clerkAuth as unknown as Mock).mockImplementation(() => ({ userId: null, sessionClaims: null }))
        const queryClient = appLikeQueryClient()

        renderWithProviders(<SessionOrgSlugs />, { queryClient })
        await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1))

        window.dispatchEvent(new Event('visibilitychange'))
        await waitFor(() => expect(queryClient.isFetching()).toBe(0))
        renderWithProviders(<SessionOrgSlugs />, { queryClient })
        await waitFor(() => expect(queryClient.isFetching()).toBe(0))

        expect(notifications.show).toHaveBeenCalledTimes(1)
        const lists = screen.getAllByRole('status', { name: 'session orgs' })
        expect(lists.map((list) => list.textContent)).toEqual(['loading', 'loading'])
    })

    // The app refetches every query every 15 minutes; a failure then still leaves a usable list.
    it('stays quiet when a background refresh fails while the list is on screen', async () => {
        const userId = faker.string.uuid()
        mockClerkSession({ clerkUserId: 'c1', userId, orgSlug: 'from-clerk', slimMetadata: true })
        ;(clerkAuth as unknown as Mock).mockImplementation(() => ({ userId: null, sessionClaims: null }))
        const queryClient = appLikeQueryClient()
        renderWithLayoutInfo(serverInfoFor(userId), queryClient)

        await act(() => queryClient.refetchQueries({ queryKey: CURRENT_USER_INFO_KEY }))

        expect(queryClient.getQueryState([...CURRENT_USER_INFO_KEY, 'c1'])?.status).toBe('error')
        expect(notifications.show).not.toHaveBeenCalled()
        expect(orgList()).toHaveTextContent('from-server')
    })

    it('ignores the layout org list once Clerk reports the user signed out', () => {
        mockClerkSession(null)

        renderWithLayoutInfo(serverInfoFor(faker.string.uuid()))

        expect(orgList()).toHaveTextContent('loading')
    })

    it('ignores the layout org list when it belongs to another account', () => {
        mockClerkSession({ clerkUserId: 'c1', userId: faker.string.uuid(), orgSlug: 'from-clerk' })

        renderWithLayoutInfo(serverInfoFor(faker.string.uuid()))

        expect(orgList()).toHaveTextContent('from-clerk')
    })
})
