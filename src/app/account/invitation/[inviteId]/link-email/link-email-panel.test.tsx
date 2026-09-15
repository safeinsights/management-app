import {
    db,
    insertTestOrg,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    testEmail,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useReverification, useUser } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import router from 'next-router-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkEmailPanel } from './link-email-panel'

type FakeAddress = {
    id: string
    emailAddress: string
    verification: { status: string }
    prepareVerification: Mock
    attemptVerification: Mock
    destroy: Mock
}

const fakeAddress = (emailAddress: string, status = 'unverified'): FakeAddress => ({
    id: `addr-${emailAddress}`,
    emailAddress,
    verification: { status },
    prepareVerification: vi.fn().mockResolvedValue(undefined),
    attemptVerification: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
})

const clerkApiError = (code: string) => ({ errors: [{ code, message: code, longMessage: code }] })

// Clerk is auto-mocked globally, so every export is a bare spy; these give the two this screen uses
// the shapes the real SDK returns.
const mockClerkUser = (accountEmail: string, addresses: FakeAddress[] = []) => {
    const createEmailAddress = vi.fn()
    const user = {
        primaryEmailAddress: { emailAddress: accountEmail },
        emailAddresses: addresses,
        createEmailAddress,
        reload: vi.fn().mockResolvedValue(undefined),
    }
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: true, user })
    ;(useReverification as Mock).mockImplementation((fn: unknown) => fn)
    return { user, createEmailAddress }
}

// A claimed invite addressed to somebody else, which is the only state this screen loads in.
const setupClaimedInvite = async () => {
    const { user } = await mockSessionWithTestData({ orgType: 'lab' })
    const invitingOrg = await insertTestOrg({ slug: 'inviting-lab', type: 'lab' })
    const invitedEmail = testEmail()
    const invite = await db
        .insertInto('pendingUser')
        .values({ email: invitedEmail, orgId: invitingOrg.id, isAdmin: false, claimedByUserId: user.id })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { user, invitingOrg, invitedEmail, invite }
}

const renderPage = (inviteId: string) => renderWithProviders(<LinkEmailPanel inviteId={inviteId} />)

describe('invite email linking screen', () => {
    beforeEach(() => {
        router.setCurrentUrl('/')
    })

    it('sends a code to the invited address and links it once the code is accepted', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        expect(await screen.findByText(/Enter the code we sent to/)).toBeDefined()
        expect(createEmailAddress).toHaveBeenCalledWith({ email: invitedEmail })
        expect(address.prepareVerification).toHaveBeenCalledWith({ strategy: 'email_code' })

        await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '424242')
        await userEvent.click(screen.getByRole('button', { name: /verify and link/i }))

        await waitFor(() => expect(address.attemptVerification).toHaveBeenCalledWith({ code: '424242' }))

        // The toast asserts a merge, so it may only fire once a verification has actually succeeded.
        await waitFor(() =>
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Accounts successfully linked',
                    message: `You’ve successfully linked your SafeInsights accounts under ${user.email}.`,
                }),
            ),
        )
        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
    })

    it('never force-verifies: the address is created unverified and only attemptVerification confirms it', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        expect(createEmailAddress).toHaveBeenCalledTimes(1)
        expect(createEmailAddress.mock.calls[0][0]).not.toHaveProperty('verified')
    })

    it('reuses an address Clerk kept from an abandoned attempt instead of creating a second', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const existing = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [existing])

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        expect(createEmailAddress).not.toHaveBeenCalled()
        expect(existing.prepareVerification).toHaveBeenCalledWith({ strategy: 'email_code' })
    })

    it('skips straight to the dashboard with no toast when the address is already verified', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const { createEmailAddress } = mockClerkUser(user.email!, [fakeAddress(invitedEmail, 'verified')])

        renderPage(invite.id)

        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(createEmailAddress).not.toHaveBeenCalled()
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('discards the unverified address and keeps the membership when the person skips', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        await userEvent.click(screen.getByRole('button', { name: /skip for now/i }))

        await waitFor(() => expect(address.destroy).toHaveBeenCalled())
        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('explains and moves on when the address belongs to another SafeInsights account', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockRejectedValue(clerkApiError('form_identifier_exists'))

        renderPage(invite.id)

        expect(await screen.findByText(new RegExp(`already belongs to another SafeInsights account`))).toBeDefined()
        expect(screen.getByText(new RegExp(invitedEmail))).toBeDefined()

        await userEvent.click(screen.getByRole('button', { name: /continue/i }))
        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('reports a wrong code without leaving the screen', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        address.attemptVerification.mockRejectedValue(clerkApiError('form_code_incorrect'))
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '000000')
        await userEvent.click(screen.getByRole('button', { name: /verify and link/i }))

        expect(await screen.findByText(/Invalid verification code/)).toBeDefined()
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('shows the invalid-invite panel when the invite is not this account to finish', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        mockClerkUser(user.email!, [])

        renderPage('019f38c6-804c-70ac-b02a-a4b87d432bc2')

        expect(await screen.findByText('This invitation is no longer valid')).toBeDefined()
    })
})
