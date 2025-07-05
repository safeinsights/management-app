import { describe, expect, it, vi } from 'vitest'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { RegenerateKeys } from './regenerate-keys'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { updateReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { GenerateKeys } from '../../(anon)/keys/generate-keys'
import router from 'next-router-mock'

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
            publicMetadata: {
                userId: 'user-id',
                orgs: [{ slug: 'dev', isAdmin: false, isResearcher: true, isReviewer: true }],
            } as UserPublicMetadata,
        })

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

        // Wait for navigation to /account/keys
        await waitFor(() => {
            expect(router.asPath).toBe('/account/keys')
        })

        // Simulate the /account/keys page render which handles key regeneration after navigation
        renderWithProviders(<GenerateKeys isRegenerating={true} />)

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
