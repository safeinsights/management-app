import { describe, expect, it, renderHook, mockClerkSession, faker } from '@/tests/unit.helpers'
import { SessionInfoProvider } from '@/components/layout/session-info-context'
import { useSession } from './session'

describe('useSession', () => {
    it('uses the org list from the server when the layout passes one', () => {
        mockClerkSession({
            clerkUserId: 'c1',
            userId: faker.string.uuid(),
            orgSlug: 'from-clerk',
            orgId: faker.string.uuid(),
        })
        const userInfo: UserInfo = {
            format: 'v3',
            user: { id: faker.string.uuid() },
            teams: null,
            orgs: { 'from-server': { id: faker.string.uuid(), slug: 'from-server', type: 'lab', isAdmin: false } },
        }

        const { result } = renderHook(() => useSession(), {
            wrapper: ({ children }) => <SessionInfoProvider userInfo={userInfo}>{children}</SessionInfoProvider>,
        })

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
})
