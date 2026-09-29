import { notifications } from '@mantine/notifications'
import { clerkClient } from '@clerk/nextjs/server'
import {
    db,
    describe,
    expect,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { sendInviteEmail } from '@/server/mailer'
import { InviteButton } from './invitation'

vi.mock('@/server/mailer', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailer')>()),
    sendInviteEmail: vi.fn(),
}))

const renderInviteModal = async () => {
    const { org } = await mockSessionWithTestData({ isAdmin: true })
    ;(clerkClient as unknown as Mock).mockResolvedValue({
        users: { getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }) },
    })

    renderWithProviders(<InviteButton orgSlug={org.slug} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invite People' }))

    return org
}

const submitInvite = async (email: string) => {
    await userEvent.type(screen.getByLabelText('Invite by email'), email)
    await userEvent.click(screen.getByLabelText('Contributor (full access within their role; no admin privileges)'))

    const send = screen.getByRole('button', { name: 'Send invitation' })
    await waitFor(() => expect(send).toBeEnabled())
    await userEvent.click(send)
}

describe('InviteButton', () => {
    it('shows the success panel and the resend toast when the email already has a pending invite', async () => {
        const org = await renderInviteModal()
        const pending = await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'already@test.com', isAdmin: false })
            .returning('id')
            .executeTakeFirstOrThrow()

        await submitInvite('already@test.com')

        expect(await screen.findByText('Invitation sent successfully!')).toBeInTheDocument()
        expect(sendInviteEmail).toHaveBeenCalledWith({ emailTo: 'already@test.com', inviteId: pending.id })
        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invite resent' }))
        expect(screen.queryByLabelText('Invite by email')).not.toBeInTheDocument()
    })

    it('starts the next invite from a clean form after a resend', async () => {
        const org = await renderInviteModal()
        await db.insertInto('pendingUser').values({ orgId: org.id, email: 'again@test.com', isAdmin: false }).execute()

        await submitInvite('again@test.com')
        await userEvent.click(await screen.findByRole('button', { name: 'Continue to invite people' }))

        expect(screen.getByLabelText('Invite by email')).toHaveValue('')
        for (const radio of screen.getAllByRole('radio')) {
            expect(radio).not.toBeChecked()
        }
        expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled()
        expect(screen.queryByText('A permission must be selected')).not.toBeInTheDocument()
    })

    it('shows the success panel for a new email', async () => {
        const org = await renderInviteModal()

        await submitInvite('new-invitee@test.com')

        expect(await screen.findByText('Invitation sent successfully!')).toBeInTheDocument()
        expect(notifications.show).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Invite resent' }))
        const pending = await db
            .selectFrom('pendingUser')
            .select('id')
            .where('orgId', '=', org.id)
            .where('email', '=', 'new-invitee@test.com')
            .executeTakeFirst()
        expect(pending).toBeDefined()
    })
})
