import { useUser } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import router from 'next-router-mock'
import {
    beforeEach,
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    vi,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { ManageMFA } from './manage-mfa'

const mockMfaUser = (twoFactorEnabled: boolean) => {
    const user = { id: 'user-1', twoFactorEnabled, reload: vi.fn().mockResolvedValue(undefined) }
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: true, user })
    return user
}

describe('ManageMFA', () => {
    beforeEach(() => {
        router.setCurrentUrl('/account/mfa')
    })

    it('sends a signed-out visitor home with a notice', async () => {
        ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, user: null })

        renderWithProviders(<ManageMFA />)

        await waitFor(() => expect(router.asPath).toBe('/'))
        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'You must be logged in to access this page' }),
        )
    })

    it('offers enrolment to a user without MFA, reloading the user once', async () => {
        const user = mockMfaUser(false)

        renderWithProviders(<ManageMFA />)

        expect(screen.getByText('SMS Verification')).toBeDefined()
        expect(user.reload).toHaveBeenCalledTimes(1)
    })

    it('confirms MFA is on for an enrolled user', () => {
        mockMfaUser(true)

        renderWithProviders(<ManageMFA />)

        expect(screen.getByText('MFA is enabled')).toBeDefined()
    })
})
