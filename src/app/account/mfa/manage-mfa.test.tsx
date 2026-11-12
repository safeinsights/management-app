import { notifications } from '@mantine/notifications'
import router from 'next-router-mock'
import {
    BLANK_UUID,
    beforeEach,
    describe,
    expect,
    it,
    mockClerkSession,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { ManageMFA } from './manage-mfa'

const mockMfaUser = (twoFactorEnabled: boolean, factorVerificationAge?: [number, number]) =>
    mockClerkSession({
        clerkUserId: 'user-1',
        userId: BLANK_UUID,
        orgSlug: 'mfa-org',
        twoFactorEnabled,
        factorVerificationAge,
    })!.useUserReturn.user

describe('ManageMFA', () => {
    beforeEach(() => {
        router.setCurrentUrl('/account/mfa')
    })

    it('sends a signed-out visitor home with a notice', async () => {
        mockClerkSession(null)

        renderWithProviders(<ManageMFA />)

        await waitFor(() => expect(router.asPath).toBe('/'))
        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'You must be logged in to access this page' }),
        )
    })

    it('offers enrolment to a user without MFA, reloading the user once', async () => {
        const user = mockMfaUser(false, [0, -1])

        renderWithProviders(<ManageMFA />)

        expect(screen.getByText('SMS Verification')).toBeDefined()
        expect(user.reload).toHaveBeenCalledTimes(1)
    })

    it('confirms MFA is on for an enrolled user', () => {
        mockMfaUser(true)

        renderWithProviders(<ManageMFA />)

        expect(screen.getByText('MFA is enabled')).toBeDefined()
    })

    it('sends an enrolled user whose session never verified the factor back through sign-in', async () => {
        mockMfaUser(true, [0, -1])

        renderWithProviders(<ManageMFA />)

        await waitFor(() => expect(router.asPath).toBe('/account/signin?mfa=verify'))
        expect(screen.queryByText('MFA is enabled')).toBeNull()
    })
})
