import {
    act,
    db,
    describe,
    expect,
    faker,
    insertTestOrg,
    mockPathname,
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
    within,
    type Mock,
} from '@/tests/unit.helpers'
import { takeInvitationNotice } from '@/lib/invitation-notice'
import { Routes } from '@/lib/routes'
import { useAuth } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Suspense } from 'react'
import AddTeam from './page'

const renderInviteFrom = async (orgName: string) => {
    const { user } = await mockSessionWithTestData({ orgType: 'lab' })
    const invitingOrg = await insertTestOrg({ slug: faker.string.alpha(10), name: orgName, type: 'lab' })
    const invite = await db
        .insertInto('pendingUser')
        .values({ email: user.email!, orgId: invitingOrg.id, isAdmin: false })
        .returning('id')
        .executeTakeFirstOrThrow()
    // A previous test may have left the router on the dashboard, which would satisfy the URL wait early.
    mockPathname(Routes.accountInvitationJoinTeam({ inviteId: invite.id }))

    await act(async () => {
        renderWithProviders(
            <Suspense>
                <AddTeam params={Promise.resolve({ inviteId: invite.id })} />
            </Suspense>,
        )
    })
}

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

    it('leaves a skip notice for the dashboard without putting it in the URL', async () => {
        const orgName = `R&D + Co #${faker.string.alpha(6)}`
        await renderInviteFrom(orgName)

        await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.dashboard))
        expect(takeInvitationNotice()).toEqual({ kind: 'skip', orgName })
    })

    it('leaves a decline notice for the dashboard without putting it in the URL', async () => {
        const orgName = `R&D + Co #${faker.string.alpha(6)}`
        await renderInviteFrom(orgName)

        await userEvent.click(await screen.findByRole('button', { name: 'Decline invitation' }))
        await userEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', { name: 'Decline invitation' }),
        )

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.dashboard))
        expect(takeInvitationNotice()).toEqual({ kind: 'decline', orgName })
    })

    it('still leaves for the dashboard after a decline when storage is unavailable', async () => {
        await renderInviteFrom(faker.company.name())
        // happy-dom's Storage is a proxy that ignores spies, so the global is replaced instead.
        vi.stubGlobal('sessionStorage', {
            getItem: () => null,
            removeItem: () => {},
            setItem: () => {
                throw new DOMException('Quota exceeded', 'QuotaExceededError')
            },
        })

        await userEvent.click(await screen.findByRole('button', { name: 'Decline invitation' }))
        await userEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', { name: 'Decline invitation' }),
        )

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.dashboard))
        expect(takeInvitationNotice()).toBeNull()
        vi.unstubAllGlobals()
    })
})
