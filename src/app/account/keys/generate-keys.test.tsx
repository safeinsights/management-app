import { describe, expect, it, vi } from 'vitest'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { GenerateKeys } from './generate-keys'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { UseUserReturn } from '@clerk/types'
import { useUser } from '@clerk/nextjs'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { setReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'

vi.mock('si-encryption/util/keypair', () => ({
    generateKeyPair: vi.fn(),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    setReviewerPublicKeyAction: vi.fn(),
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

        expect(screen.getByText(/create private key/i)).toBeDefined()
        const generateKeypairButton = screen.getByRole('button', { name: /create private key/i })
        expect(generateKeypairButton).toBeDefined()

        fireEvent.click(generateKeypairButton)

        // Wait for state updates
        await waitFor(() => {
            // Verify that setMemberUserPublicKey was called
            expect(setReviewerPublicKeyAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicKey: mockKeys.exportedPublicKey,
                    fingerprint: mockKeys.fingerprint,
                }),
            )

            expect(screen.getByText('Private key')).toBeDefined()
        })

        // Simulate copy button click
        fireEvent.click(screen.getByRole('button', { name: /copy private key/i }))
    })
})
