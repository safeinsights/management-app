import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { fireEvent, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react'
import { UseUserReturn } from '@clerk/types'
import { useUser } from '@clerk/nextjs'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { setMemberUserPublicKey } from '@/server/actions/user-key-actions'

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

vi.mock('si-encryption/util/keypair', () => ({
    generateKeyPair: vi.fn(),
}))

vi.mock('@/server/actions/user-key-actions', () => ({
    setMemberUserPublicKey: vi.fn(),
}))

describe('User keypair generation', () => {
    it('renders help text and generate button', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: {
                firstName: 'Tester',
            },
        } as UseUserReturn)

        const mockKeys = {
            publicKeyString: 'mockPublicKey',
            privateKeyString: 'mockPrivateKey',
            fingerprint: 'mockFingerprint',
            exportedPublicKey: new ArrayBuffer(8),
        }

        vi.mocked(generateKeyPair).mockResolvedValue(mockKeys as never)

        renderWithProviders(<GenerateKeys />)

        expect(screen.getByText(/create your private key/i)).toBeDefined()
        const generateKeypairButton = screen.getByRole('button', { name: /generate keypair/i })
        expect(generateKeypairButton).toBeDefined()

        fireEvent.click(generateKeypairButton)

        // Wait for state updates
        await waitFor(() => {
            expect(screen.getByText('Public key:')).toBeDefined()
            expect(screen.getByText('Private key:')).toBeDefined()
        })

        // Simulate copy button clicks
        fireEvent.click(screen.getByRole('button', { name: /copy public key/i }))
        fireEvent.click(screen.getByRole('button', { name: /copy private key/i }))

        // Verify that setMemberUserPublicKey was called
        expect(setMemberUserPublicKey).toHaveBeenCalledWith(mockKeys.exportedPublicKey, mockKeys.fingerprint)
    })
})
