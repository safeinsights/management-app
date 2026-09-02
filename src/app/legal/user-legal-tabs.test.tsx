import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { mockSessionWithTestData, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { UserLegalTabs } from './user-legal-tabs'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const TAB_NAMES = [
    'Study Agreement',
    'Data Organization Participation Agreement',
    'Research Organization Participation Agreement',
    'Terms of Service',
    'Privacy Notice',
]

describe('UserLegalTabs', () => {
    it('offers all five tabs regardless of the org the user belongs to', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        renderWithProviders(<UserLegalTabs />)

        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(TAB_NAMES)
    })

    it('opens on Study Agreements and switches panel on click', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserLegalTabs />)

        await waitFor(() =>
            expect(screen.getByText('You have not acknowledged any Study Agreements yet')).toBeDefined(),
        )

        await userEvent.click(screen.getByRole('tab', { name: 'Research Organization Participation Agreement' }))

        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Research Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
        // keepMounted={false}, so the Study Agreements panel unmounts rather than query behind it.
        expect(screen.queryByText('You have not acknowledged any Study Agreements yet')).toBeNull()
    })
})
