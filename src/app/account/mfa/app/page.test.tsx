import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers' // Uses Mantine/Query providers
import { screen, waitFor } from '@testing-library/react'
import { useUser } from '@clerk/nextjs'
import { type UseUserReturn, type TOTPResource } from '@clerk/types'
import AddMFaScreen from './page' // Import the default export

// --- Mocking Core Dependencies ---

// Mock Clerk's useUser hook
vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

// Mock the backup codes component entirely
vi.mock('../backup-codes', () => ({
    GenerateBackupCodes: () => <div data-testid="mock-backup-codes">Mocked Backup Codes</div>,
}))

// Mock the QR code component
vi.mock('qrcode.react', () => ({
    QRCodeSVG: (props: { value: string }) => <svg data-testid="qr-code" data-value={props.value}></svg>,
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
    default: {
        error: vi.fn(),
        // Add other methods if needed
    },
}))

// --- Test Suite ---

describe('AddMFaScreen (Authenticator App)', () => {
    // Explicitly type the mock for better control
    const mockUseUser = useUser as vi.Mock<[], UseUserReturn>
    const mockCreateTOTP = vi.fn()
    const mockVerifyTOTP = vi.fn()

    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks()

        // Default setup: User is loaded and signed in
        mockUseUser.mockReturnValue({
            isLoaded: true,
            isSignedIn: true,
            user: {
                id: 'user_123',
                createTOTP: mockCreateTOTP,
                verifyTOTP: mockVerifyTOTP,
                // Mock any other user properties accessed by the component
            },
        } as unknown as UseUserReturn)

        // Default mock for the createTOTP call within useEffect
        mockCreateTOTP.mockResolvedValue({
            uri: 'otpauth://totp/Test?secret=MOCKSECRET&issuer=TestIssuer',
        } as TOTPResource)
    })

    it('should render null when Clerk is not loaded', () => {
        mockUseUser.mockReturnValue({ isLoaded: false } as UseUserReturn)
        const { container } = renderWithProviders(<AddMFaScreen />)
        // Expect the component to render nothing while loading
        expect(container.firstChild).toBeNull()
    })

    it('should render logged out message when user is not signed in', () => {
        mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null } as UseUserReturn)
        renderWithProviders(<AddMFaScreen />)
        expect(screen.getByText('You must be logged in to access this page')).toBeTruthy()
    })

    it('should render the initial "add" step correctly', async () => {
        renderWithProviders(<AddMFaScreen />)

        // Wait for async operations in useEffect (like createTOTP) to potentially complete
        await waitFor(() => {
            // Check for the panel title specific to the 'add' step
            expect(screen.getByRole('heading', { name: 'Authenticator App Verification' })).toBeTruthy()
        })

        // Verify elements specific to the 'add' step are visible
        expect(screen.getByTestId('qr-code')).toBeTruthy()
        expect(screen.getByPlaceholderText('000000')).toBeTruthy() // Code input

        const verifyButton = screen.getByRole('button', { name: 'Verify Code' }) as HTMLButtonElement
        expect(verifyButton).toBeTruthy()
        expect(verifyButton.disabled).toBe(true) // Should be disabled initially
    })

    // We are keeping tests basic, so not testing transitions between steps (add -> backupcodes -> success)
    // or form submissions.
})
