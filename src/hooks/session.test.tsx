import {
    describe,
    expect,
    it,
    renderHook,
    mockClerkSession,
    mockSessionWithTestData,
    faker,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { SessionInfoProvider } from '@/components/layout/session-info-context'
import { useSession } from './session'

const serverInfoFor = (userId: string): UserInfo => ({
    format: 'v3',
    user: { id: userId },
    teams: null,
    orgs: { 'from-server': { id: faker.string.uuid(), slug: 'from-server', type: 'lab', isAdmin: false } },
})

const renderWithServerInfo = (userInfo: UserInfo) =>
    renderHook(() => useSession(), {
        wrapper: ({ children }) => <SessionInfoProvider userInfo={userInfo}>{children}</SessionInfoProvider>,
    })

describe('useSession', () => {
    it('uses the org list from the server when the layout passes one', () => {
        const userId = faker.string.uuid()
        mockClerkSession({ clerkUserId: 'c1', userId, orgSlug: 'from-clerk', orgId: faker.string.uuid() })

        const { result } = renderWithServerInfo(serverInfoFor(userId))

        expect(result.current.isLoaded).toBe(true)
        expect(Object.keys(result.current.session!.orgs)).toEqual(['from-server'])
    })

    it('falls back to the Clerk metadata when no provider value exists', () => {
        mockClerkSession({
            clerkUserId: 'c1',
            userId: faker.string.uuid(),
            orgSlug: 'from-clerk',
            orgId: faker.string.uuid(),
        })

        const { result } = renderHook(() => useSession())

        expect(Object.keys(result.current.session?.orgs ?? {})).toEqual(['from-clerk'])
    })

    it('loads the org list from the server when the Clerk metadata has none', async () => {
        const { user, org, useUserReturn } = await mockSessionWithTestData()
        ;(useUser as Mock).mockReturnValue({
            ...useUserReturn,
            user: { ...useUserReturn!.user, publicMetadata: { format: 'v3', user: { id: user.id }, teams: null } },
        })

        const { result } = renderHook(() => useSession())

        expect(result.current).toEqual({ isLoaded: false, session: null })
        await waitFor(() => expect(result.current.isLoaded).toBe(true))
        expect(Object.keys(result.current.session!.orgs)).toEqual([org.slug])
    })

    it('ignores the layout org list once Clerk reports the user signed out', () => {
        mockClerkSession(null)

        const { result } = renderWithServerInfo(serverInfoFor(faker.string.uuid()))

        expect(result.current).toEqual({ isLoaded: false, session: null })
    })

    it('ignores the layout org list when it belongs to another account', () => {
        mockClerkSession({
            clerkUserId: 'c1',
            userId: faker.string.uuid(),
            orgSlug: 'from-clerk',
            orgId: faker.string.uuid(),
        })

        const { result } = renderWithServerInfo(serverInfoFor(faker.string.uuid()))

        expect(Object.keys(result.current.session?.orgs ?? {})).toEqual(['from-clerk'])
    })
})
