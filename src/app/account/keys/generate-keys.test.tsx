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

describe('Reviewer keypair generation', () => {
    it('should generate a reviewer key pair and display private key for copying', async () => {
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

        await waitFor(() => {
            expect(vi.mocked(generateKeyPair)).toHaveBeenCalled()
            expect(screen.getByText('Reviewer key', { selector: 'h1' })).toBeDefined()
        })

        // Simulate copy button click
        const copyKeyButton = screen.getByRole('button', { name: /copy key/i })
        expect(copyKeyButton).toBeDefined()
        fireEvent.click(copyKeyButton)
        await waitFor(() => {
            expect(screen.getByText('Copied!')).toBeDefined()
        })

        const dashboardButton = screen.getByRole('button', { name: 'Go to dashboard' })
        fireEvent.click(dashboardButton)

        await waitFor(() => {
            expect(screen.getByText('Make sure you have securely saved your reviewer key.')).toBeDefined()
        })

        fireEvent.click(screen.getByRole('button', { name: 'Yes, go to dashboard' }))

        // Wait for state updates
        await waitFor(() => {
            // Verify that setMemberUserPublicKey was called
            expect(setReviewerPublicKeyAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicKey: mockKeys.exportedPublicKey,
                    fingerprint: mockKeys.fingerprint,
                }),
            )
        })
    })
})
