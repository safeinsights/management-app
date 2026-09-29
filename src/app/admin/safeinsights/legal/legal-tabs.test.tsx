import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { LegalTabs } from './legal-tabs'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
    }
})

describe('LegalTabs', () => {
    it('opens on Terms of Service and switches to the study agreement panel', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<LegalTabs />)

        expect(await screen.findByRole('button', { name: 'Upload' })).toBeDefined()

        fireEvent.click(screen.getByRole('tab', { name: 'Study Agreements' }))

        await waitFor(() => expect(screen.getByRole('button', { name: 'Upload signed study agreement' })).toBeDefined())
        expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    })
})
