import {
    db,
    fireEvent,
    insertKeylessInvitedUser,
    Mock,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { vi, describe, it, expect } from 'vitest'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'

describe('RecoveryCodeSignIn', () => {
    it('successfully signs in with a recovery code and redirects to dashboard', async () => {
        const mockAttemptSecondFactor = vi.fn().mockResolvedValue({
            status: 'complete',
            createdSessionId: 'test-session-id',
        })
        const mockSetActive = vi.fn()

        // Override the global mock
        ;(useSignIn as Mock).mockReturnValue({
            isLoaded: true,
            signIn: { attemptSecondFactor: mockAttemptSecondFactor },
            setActive: mockSetActive,
        })

        const setStep = vi.fn()
        renderWithProviders(<RecoveryCodeSignIn setStep={setStep} />)

        const input = screen.getByLabelText(/Enter recovery code/i)
        const submitBtn = screen.getByRole('button', { name: /Sign in/i })

        await userEvent.type(input, 'testcode123')
        fireEvent.click(submitBtn)

        await waitFor(() => {
            expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
                strategy: 'backup_code',
                code: 'testcode123',
            })
            expect(mockSetActive).toHaveBeenCalledWith({ session: 'test-session-id' })
            expect(memoryRouter.asPath).toBe(Routes.dashboard)
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    message: expect.stringContaining('signed in using a recovery code'),
                }),
            )
        })
    })
    // This branch used to push straight to the dashboard, so an invited user reaching for a backup
    // code never joined the org.
    it('accepts a pending invite and routes a keyless user through key generation', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        memoryRouter.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)
        ;(useSignIn as Mock).mockReturnValue({
            isLoaded: true,
            signIn: {
                attemptSecondFactor: vi
                    .fn()
                    .mockResolvedValue({ status: 'complete', createdSessionId: 'test-session-id' }),
            },
            setActive: vi.fn(),
        })
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })

        renderWithProviders(<RecoveryCodeSignIn setStep={vi.fn()} />)

        await userEvent.type(screen.getByLabelText(/Enter recovery code/i), 'testcode123')
        fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

        // The membership is the point: the old branch dropped invite_id entirely.
        await waitFor(async () => {
            const membership = await db
                .selectFrom('orgUser')
                .select('id')
                .where('userId', '=', user.id)
                .where('orgId', '=', invitingOrg.id)
                .executeTakeFirst()
            expect(membership).toBeDefined()
        })

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/${invitingOrg.slug}/dashboard`)}`,
            ),
        )
    })
})
