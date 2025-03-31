/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers' // Uses Mantine/Query providers
import { screen } from '@testing-library/react'
import { useUser } from '@clerk/nextjs'
import { type UseUserReturn, type PhoneNumberResource } from '@clerk/types'
import ManageSMSMFA from './page' // Import the default export

// --- Mocking Core Dependencies ---

// Mock Clerk's useUser hook
vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

// Mock the backup codes component entirely
vi.mock('../backup-codes', () => ({
    GenerateBackupCodes: () => <div data-testid="mock-backup-codes">Mocked Backup Codes</div>,
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
    default: {
        error: vi.fn(),
        // Add other methods if needed
    },
}))

// --- Test Suite ---

describe('ManageSMSMFA', () => {
    // Explicitly type the mock
    const mockUseUser = useUser as vi.Mock<[], UseUserReturn>
    const mockCreatePhoneNumber = vi.fn()
    const mockPrepareVerification = vi.fn()
    const mockAttemptVerification = vi.fn()
    const mockSetReserved = vi.fn()
    const mockMakeDefault = vi.fn()
    const mockReload = vi.fn()

    // Helper to setup mock user state
    const setupMockUser = (phoneNumbers: Partial<PhoneNumberResource>[] = []) => {
        mockUseUser.mockReturnValue({
            isLoaded: true,
            isSignedIn: true,
            user: {
                id: 'user_123',
                phoneNumbers: phoneNumbers.map((p) => ({
                    id: p.id || 'phone_123',
                    phoneNumber: p.phoneNumber || '+15551234567',
                    verification: { status: 'verified', ...p.verification },
                    reservedForSecondFactor: p.reservedForSecondFactor || false,
                    prepareVerification: mockPrepareVerification,
                    attemptVerification: mockAttemptVerification,
                    setReservedForSecondFactor: mockSetReserved,
                    makeDefaultSecondFactor: mockMakeDefault,
                    ...p, // Allow overriding mocks per phone number if needed
                })),
                createPhoneNumber: mockCreatePhoneNumber,
                reload: mockReload,
                // Mock any other user properties accessed
            },
        } as unknown as UseUserReturn)

        // Mock the creation flow methods
        mockCreatePhoneNumber.mockResolvedValue({
            prepareVerification: mockPrepareVerification,
            // Mock other necessary properties/methods of the created resource
        })
        mockPrepareVerification.mockResolvedValue(undefined) // prepareVerification returns void
    }

    beforeEach(() => {
        vi.resetAllMocks()
        // Default setup: User is loaded, signed in, no existing phone numbers
        setupMockUser([])
    })

    it('should render logged out message when user is not signed in', () => {
        mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null } as UseUserReturn)
        renderWithProviders(<ManageSMSMFA />)
        expect(screen.getByText('You must be logged in to access this page')).toBeTruthy()
    })

    it('should render initial state correctly when user has NO existing phone number', () => {
        setupMockUser([]) // Ensure no phone numbers
        renderWithProviders(<ManageSMSMFA />)

        // Check panel title
        expect(screen.getByText('SMS Verification')).toBeTruthy()

        // Check phone input state
        const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement
        expect(phoneInput).toBeTruthy()
        expect(phoneInput.disabled).toBe(false) // Should be editable
        expect(phoneInput.value).toBe('') // Should be empty

        // Check button states
        const sendCodeButton = screen.getByRole('button', { name: 'Send Code' })
        expect(sendCodeButton).toBeTruthy()
        // Mantine might disable based on empty input, but it should exist
        // expect(sendCodeButton).toBeEnabled();

        const verificationInput = screen.getByLabelText('Verification Code') as HTMLInputElement
        expect(verificationInput).toBeTruthy()
        expect(verificationInput.disabled).toBe(true) // Disabled until code is sent

        const verifyButton = screen.getByRole('button', { name: 'Verify Code' }) as HTMLButtonElement
        expect(verifyButton).toBeTruthy()
        expect(verifyButton.disabled).toBe(true) // Disabled initially
    })

    it('should render initial state correctly when user HAS an existing phone number', () => {
        const existingPhoneNumber = '+15559876543'
        setupMockUser([{ phoneNumber: existingPhoneNumber }]) // Setup with one phone number
        renderWithProviders(<ManageSMSMFA />)

        // Check panel title (using text matching, since Mantine renders the title as a paragraph)
        expect(screen.getByText('SMS Verification')).toBeTruthy()

        // Check phone input state
        const phoneInput = screen.getByLabelText('Phone Number') as HTMLInputElement
        expect(phoneInput).toBeTruthy()
        expect(phoneInput.disabled).toBe(true) // Should NOT be editable
        expect(phoneInput.value).toBe(existingPhoneNumber) // Should be prefilled

        // Check button states
        const sendCodeButton = screen.getByRole('button', { name: 'Send Code' }) as HTMLButtonElement
        expect(sendCodeButton).toBeTruthy()
        expect(sendCodeButton.disabled).toBe(true) // Disabled because phone exists

        const verificationInput = screen.getByLabelText('Verification Code') as HTMLInputElement
        expect(verificationInput).toBeTruthy()
        expect(verificationInput.disabled).toBe(true) // Disabled until code is sent (which can't happen here)

        const verifyButton = screen.getByRole('button', { name: 'Verify Code' }) as HTMLButtonElement
        expect(verifyButton).toBeTruthy()
        expect(verifyButton.disabled).toBe(true) // Disabled initially
    })

    // Keeping tests basic: Not testing button clicks, form submissions, or state changes (like codeSent, verificationSuccess).
})
