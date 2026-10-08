import { beforeEach, describe, expect, it, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestOrg,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    testEmail,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import AcceptInvitePage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (inviteId: string) => AcceptInvitePage({ params: Promise.resolve({ inviteId }) })

const insertClaimedInvite = async (claimedByUserId: string) => {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    return db
        .insertInto('pendingUser')
        .values({ email: testEmail(), orgId: org.id, isAdmin: false, claimedByUserId })
        .returning('id')
        .executeTakeFirstOrThrow()
}

describe('AcceptInvitePage', () => {
    it('shows an inline invalid-invite panel for a signed-in user when the invite is missing', async () => {
        await mockSessionWithTestData()

        const page = await renderRoute(faker.string.uuid())
        renderWithProviders(page)

        expect(screen.getByText(/no longer valid/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /go to your dashboard/i })).toBeInTheDocument()
    })

    it('sends the claimer back to the linking screen, so a skipped link can be finished later', async () => {
        const { user } = await mockSessionWithTestData()
        const invite = await insertClaimedInvite(user.id)

        await expect(renderRoute(invite.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(
            Routes.accountInvitationLinkEmail({ inviteId: invite.id }),
            expect.anything(),
        )
    })

    it('shows the invalid-invite panel to a signed-in user who did not claim the invite', async () => {
        await mockSessionWithTestData()
        const { user: claimer } = await insertTestUser({ org: await insertTestOrg() })
        const invite = await insertClaimedInvite(claimer.id)

        const page = await renderRoute(invite.id)
        renderWithProviders(page)

        expect(screen.getByText(/no longer valid/i)).toBeInTheDocument()
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('asks a signed-out visitor to sign in before resuming a claimed invite', async () => {
        const { user: claimer } = await insertTestUser({ org: await insertTestOrg() })
        const invite = await insertClaimedInvite(claimer.id)
        vi.mocked(auth).mockResolvedValue({ userId: null, sessionClaims: null } as never)

        await expect(renderRoute(invite.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(
            `${Routes.accountSignin}?redirect_url=${Routes.accountInvitationLinkEmail({ inviteId: invite.id })}`,
            expect.anything(),
        )
    })
})
