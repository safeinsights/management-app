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
import { readJoinedOrg } from '@/lib/joined-org'
import { useReverification, useUser } from '@clerk/nextjs'
import router from 'next-router-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkEmailPanel } from './link-email-panel'

type FakeAddress = {
    id: string
    emailAddress: string
    verification: { status: string }
    reload: Mock
    prepareVerification: Mock
    attemptVerification: Mock
    destroy: Mock
}

const fakeAddress = (emailAddress: string, status = 'unverified'): FakeAddress => {
    const address: FakeAddress = {
        id: `addr-${emailAddress}`,
        emailAddress,
        verification: { status },
        reload: vi.fn(),
        prepareVerification: vi.fn().mockResolvedValue(undefined),
        attemptVerification: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
    }
    address.reload.mockResolvedValue(address)
    return address
}

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
        sessionStorage.clear()
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

        // The banner copy asserts a merge, so it may only name the address once a verification has
        // actually succeeded.
        await waitFor(() => expect(readJoinedOrg()).toEqual({ orgName: invitingOrg.name, linkedEmail: invitedEmail }))
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
        expect(readJoinedOrg()).toBeNull()
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
        expect(readJoinedOrg()).toBeNull()
    })

    it('keeps a verified address when another tab linked it before the person skips', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        address.reload.mockResolvedValue({ ...address, verification: { status: 'verified' } })
        await userEvent.click(screen.getByRole('button', { name: /skip for now/i }))

        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(address.destroy).not.toHaveBeenCalled()
    })

    it('shows the generic failure when Clerk refuses the address, and skipping still lands on the dashboard', async () => {
        const { user, invitingOrg, invite } = await setupClaimedInvite()
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockRejectedValue(clerkApiError('form_identifier_exists'))

        renderPage(invite.id)

        expect(await screen.findByText('We could not link this email address')).toBeDefined()
        expect(screen.queryByText(/form_identifier_exists/)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: /skip for now/i }))
        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(readJoinedOrg()).toBeNull()
    })

    it('reuses the created address when the first send fails, and skip can still discard it', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        address.prepareVerification.mockRejectedValueOnce(new Error('network down'))
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await userEvent.click(await screen.findByRole('button', { name: /try again/i }))
        expect(await screen.findByText(/Enter the code we sent to/)).toBeDefined()
        expect(createEmailAddress).toHaveBeenCalledTimes(1)
        expect(address.prepareVerification).toHaveBeenCalledTimes(2)

        await userEvent.click(screen.getByRole('button', { name: /skip for now/i }))
        await waitFor(() => expect(address.destroy).toHaveBeenCalled())
        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
    })

    it('finishes the link when the code is accepted but refreshing the Clerk user fails', async () => {
        const { user, invitingOrg, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { user: clerkUser, createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)
        clerkUser.reload.mockRejectedValue(new Error('network down'))

        renderPage(invite.id)

        await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '424242')
        await userEvent.click(screen.getByRole('button', { name: /verify and link/i }))

        await waitFor(() => expect(router.asPath).toBe(`/${invitingOrg.slug}/dashboard`))
        expect(readJoinedOrg()).toEqual({ orgName: invitingOrg.name, linkedEmail: invitedEmail })
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
        expect(readJoinedOrg()).toBeNull()
    })

    it('holds back a resend inside 30 seconds and keeps the code form', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await screen.findByText(/Enter the code we sent to/)
        await userEvent.click(screen.getByRole('button', { name: /resend code/i }))

        expect(await screen.findByText(/A code was just sent/)).toBeDefined()
        expect(screen.getByLabelText('Digit 1 of 6')).toBeDefined()
        expect(address.prepareVerification).toHaveBeenCalledTimes(1)
    })

    it('keeps the code form when Clerk rate-limits a resend', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '424242')
        address.prepareVerification.mockRejectedValue(clerkApiError('too_many_requests'))
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
        await userEvent.click(screen.getByRole('button', { name: /resend code/i }))

        expect(await screen.findByText(/A code was just sent/)).toBeDefined()
        expect(address.prepareVerification).toHaveBeenCalledTimes(2)
        // The digits on screen are the ones a submit sends, so a rate limit keeps both.
        expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('2')
        await userEvent.click(screen.getByRole('button', { name: /verify and link/i }))
        await waitFor(() => expect(address.attemptVerification).toHaveBeenCalledWith({ code: '424242' }))
    })

    it('keeps the code form and the typed digits on screen while a resend is in flight', async () => {
        const { user, invitedEmail, invite } = await setupClaimedInvite()
        const address = fakeAddress(invitedEmail)
        const { createEmailAddress } = mockClerkUser(user.email!, [])
        createEmailAddress.mockResolvedValue(address)

        renderPage(invite.id)

        await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '111111')
        let finishSend = () => {}
        address.prepareVerification.mockReturnValue(new Promise<void>((resolve) => (finishSend = resolve)))
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
        await userEvent.click(screen.getByRole('button', { name: /resend code/i }))

        expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('1')
        expect(screen.queryByText('Preparing to link your email addresses')).toBeNull()

        finishSend()
        await waitFor(() => expect(screen.getByRole('button', { name: /resend code/i })).toBeEnabled())
        expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('1')
    })

    it('shows the invalid-invite panel when the invite is not this account to finish', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        mockClerkUser(user.email!, [])

        renderPage('019f38c6-804c-70ac-b02a-a4b87d432bc2')

        expect(await screen.findByText('This invitation is no longer valid')).toBeDefined()
    })
})
