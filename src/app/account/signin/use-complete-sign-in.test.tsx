import {
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
import type { FC } from 'react'
import { useCompleteSignIn } from './use-complete-sign-in'

const CompleteSignIn: FC = () => {
    const completeSignIn = useCompleteSignIn()
    return <button onClick={() => completeSignIn()}>Complete sign-in</button>
}

describe('useCompleteSignIn', () => {
    // The list loads as soon as Clerk reports the user, which can be before the invite is accepted.
    it('reloads the org list after it accepts an invite', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
        const invitingOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const invite = await db
            .insertInto('pendingUser')
            .values({ email: user.email!, orgId: invitingOrg.id, isAdmin: false })
            .returning('id')
            .executeTakeFirstOrThrow()
        memoryRouter.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)

        const queryClient = createTestQueryClient()
        const listsAtPush = recordOrgListAtPush(queryClient)

        renderWithProviders(
            <>
                <SessionOrgSlugs />
                <CompleteSignIn />
            </>,
            { queryClient },
        )
        const orgList = screen.getByRole('status', { name: 'session orgs' })
        await waitFor(() => expect(orgList).toHaveTextContent(org.slug))

        await userEvent.click(screen.getByRole('button', { name: 'Complete sign-in' }))

        await waitFor(() => expect(memoryRouter.asPath).toContain(invitingOrg.slug))
        expect(listsAtPush).toEqual([expect.arrayContaining([org.slug, invitingOrg.slug])])
    })
})
