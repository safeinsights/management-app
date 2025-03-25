import { describe, expect, it, vi } from 'vitest'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { GenerateKeys } from '@/app/account/keys/generate-keys'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { UseUserReturn } from '@clerk/types'
import { useUser } from '@clerk/nextjs'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { setMemberUserPublicKeyAction } from '@/server/actions/user-keys.actions'

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

vi.mock('si-encryption/util/keypair', () => ({
    generateKeyPair: vi.fn(),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    setMemberUserPublicKeyAction: vi.fn(),
}))

describe('User keypair generation', () => {
    it('renders help text and generate button', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: {
                firstName: 'Tester',
            },
        } as UseUserReturn)

        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: 'dev',
        })
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
            expect(screen.getByText('Private key:')).toBeDefined()
        })

        // Simulate copy button click
        fireEvent.click(screen.getByRole('button', { name: /copy private key/i }))

        // Verify that setMemberUserPublicKey was called
        expect(setMemberUserPublicKeyAction).toHaveBeenCalledWith(
            expect.objectContaining({
                publicKey: mockKeys.exportedPublicKey,
                fingerprint: mockKeys.fingerprint,
            }),
        )
    })
})
