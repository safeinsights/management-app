/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import ManageMFA from './page'
import { useUser } from '@clerk/nextjs'
import type { UseUserReturn } from '@clerk/types'

// --- Mock Clerk's useUser hook ---
vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

describe('ManageMFA', () => {
    const mockUseUser = vi.mocked(useUser, true)

    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should display a log out message when user is not signed in', () => {
        mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null } as UseUserReturn)
        renderWithProviders(<ManageMFA />)
        expect(screen.getByText('You must be logged in to access this page')).toBeTruthy()
    })

    it('should render the MFA enabled panel if user.twoFactorEnabled is true and no override is present', () => {
        mockUseUser.mockReturnValue({
            isLoaded: true,
            isSignedIn: true,
            user: { twoFactorEnabled: true, backupCodeEnabled: true } as any,
        } as UseUserReturn)
        // Ensure the query string (if any) does not force disable MFA
        window.history.pushState({}, '', '/account/mfa')
        renderWithProviders(<ManageMFA />)
        expect(screen.getByText('MFA is enabled')).toBeTruthy()
    })

    it('should render the setup panel when MFA is not enabled or forced off', () => {
        mockUseUser.mockReturnValue({
            isLoaded: true,
            isSignedIn: true,
            user: { twoFactorEnabled: false, backupCodeEnabled: false } as any,
        } as UseUserReturn)
        // Use a query parameter to override MFA enabled behavior
        window.history.pushState({}, '', '/account/mfa?TESTING_FORCE_NO_MFA=1')
        renderWithProviders(<ManageMFA />)
        expect(screen.getByText('Set up Two-Step Verification')).toBeTruthy()
    })
})
