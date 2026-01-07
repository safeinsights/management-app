import { renderWithProviders, fireEvent, screen, waitFor, userEvent, Mock } from '@/tests/unit.helpers'
import { vi, describe, it, expect } from 'vitest'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { useSignIn } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'

// Local mock for notifications since it's not in vitest.setup.ts
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

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
})
