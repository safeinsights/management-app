import { describe, expect, it, vi } from 'vitest'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { RegenerateKeys } from './regenerate-keys'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { UseUserReturn } from '@clerk/types'
import { useUser } from '@clerk/nextjs'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { updateReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'

vi.mock('si-encryption/util/keypair', () => ({
    generateKeyPair: vi.fn(),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    updateReviewerPublicKeyAction: vi.fn(),
}))

describe('Reviewer keypair regeneration', () => {
    it('should regenerate a reviewer key pair and update public key', async () => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: 'dev',
        })

        vi.mocked(useUser).mockReturnValue({
            isLoaded: true,
            isSignedIn: true,
            user: {
                firstName: 'Tester',
                organizationMemberships: [],
                publicMetadata: {
                    orgs: [{ slug: 'dev', isAdmin: false, isResearcher: true, isReviewer: true }],
                },
            },
        } as unknown as UseUserReturn)

        const mockKeys = {
            publicKeyString: 'mockPublicKey',
            privateKeyString: 'mockPrivateKey',
            fingerprint: 'mockFingerprint',
            exportedPublicKey: new ArrayBuffer(8),
        }
        vi.mocked(generateKeyPair).mockResolvedValue(mockKeys as never)

        renderWithProviders(<RegenerateKeys />)

        await waitFor(() => {
            expect(screen.getByText('Reviewer key', { selector: 'h1' })).toBeDefined()
        })

        // Open the modal requesting regeneration
        fireEvent.click(screen.getByRole('button', { name: /lost key\? generate a new one/i }))

        await waitFor(() => {
            expect(screen.getByText(/confirm key reset/i)).toBeDefined()
        })
        fireEvent.click(screen.getByRole('button', { name: /generate new key/i }))

        // GenerateKeys component should now be rendered
        await waitFor(() => {
            expect(vi.mocked(generateKeyPair)).toHaveBeenCalled()
            expect(screen.getByText('Reviewer key', { selector: 'h1' })).toBeDefined()
        })

        // mock copy key
        const copyKeyButton = screen.getByRole('button', { name: /copy key/i })
        fireEvent.click(copyKeyButton)
        await waitFor(() => {
            expect(screen.getByText('Copied!')).toBeDefined()
        })

        // Navigate to confirmation modal
        fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }))

        await waitFor(() => {
            expect(screen.getByText(/make sure you have securely saved your reviewer key\./i)).toBeDefined()
        })

        // Final confirmation which triggers updateReviewerPublicKeyAction
        fireEvent.click(screen.getByRole('button', { name: /yes, go to dashboard/i }))

        await waitFor(() => {
            expect(updateReviewerPublicKeyAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicKey: mockKeys.exportedPublicKey,
                    fingerprint: mockKeys.fingerprint,
                }),
            )
        })
    })
})
