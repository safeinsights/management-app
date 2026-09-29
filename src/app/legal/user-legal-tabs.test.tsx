import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { mockSessionWithTestData, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { UserLegalTabs } from './user-legal-tabs'

const TAB_NAMES = [
    legalDocumentCollectionLabels.SLA,
    legalDocumentCollectionLabels.DOPA,
    legalDocumentCollectionLabels.ROPA,
    legalDocumentCollectionLabels.TOS,
    legalDocumentCollectionLabels.PN,
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

        await userEvent.click(screen.getByRole('tab', { name: 'Research Organization Participation Agreements' }))

        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Research Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
        // keepMounted={false}, so the Study Agreements panel unmounts rather than query behind it.
        expect(screen.queryByText('You have not acknowledged any Study Agreements yet')).toBeNull()
    })
})
