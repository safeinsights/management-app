import { describe, expect, it, vi } from 'vitest'
import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { RegenerateKeys } from './regenerate-keys'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { generateKeyPair } from 'si-encryption/util/keypair'
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
            orgSlug: 'dev',
            userId: 'user-id',
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
    })
})
