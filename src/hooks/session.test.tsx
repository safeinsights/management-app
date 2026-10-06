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
import { useReloadOrgList, useSession } from './session'

type TestQueryClient = ReturnType<typeof createTestQueryClient>

const serverInfoFor = (userId: string): UserInfo => ({
    format: 'v3',
    user: { id: userId },
    teams: null,
    orgs: { 'from-server': { id: faker.string.uuid(), slug: 'from-server', type: 'lab', isAdmin: false } },
})

// The test client turns refetchOnMount off; the app's client leaves it on, and a request on mount
// is exactly what the layout's list must prevent.
const appLikeQueryClient = () => {
    const client = createTestQueryClient()
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, refetchOnMount: true } })
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
