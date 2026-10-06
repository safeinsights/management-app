import {
    act,
    db,
    describe,
    expect,
    faker,
    insertTestOrg,
    it,
    mockSessionWithTestData,
    createTestQueryClient,
    recordOrgListAtPush,
    renderWithProviders,
    screen,
    SessionOrgSlugs,
    userEvent,
    vi,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useAuth } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Suspense } from 'react'
import AddTeam from './page'

describe('AddTeam', () => {
    it('reloads the org list before it leaves for the joined org', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
        const invitingOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const invite = await db
            .insertInto('pendingUser')
            .values({ email: user.email!, orgId: invitingOrg.id, isAdmin: false })
            .returning('id')
            .executeTakeFirstOrThrow()

        const params = Promise.resolve({ inviteId: invite.id })

        const queryClient = createTestQueryClient()
        const listsAtPush = recordOrgListAtPush(queryClient)

        // AddTeam suspends on its params, which React only lets settle inside an awaited act.
        await act(async () => {
            renderWithProviders(
                <>
                    <SessionOrgSlugs />
                    <Suspense>
                        <AddTeam params={params} />
                    </Suspense>
                </>,
                { queryClient },
            )
        })
        const orgList = screen.getByRole('status', { name: 'session orgs' })
        await waitFor(() => expect(orgList).toHaveTextContent(org.slug))

        await userEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }))

        await waitFor(() => expect(memoryRouter.asPath).toContain(invitingOrg.slug))
        expect(listsAtPush).toEqual([expect.arrayContaining([org.slug, invitingOrg.slug])])
    })
})
