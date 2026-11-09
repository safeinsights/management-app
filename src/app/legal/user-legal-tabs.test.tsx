import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Routes } from '@/lib/routes'
import { mockPathname, mockSessionWithTestData, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { UserLegalTabs } from './user-legal-tabs'

const TAB_NAMES = [
    legalDocumentTypeLabels.SLA,
    legalDocumentTypeLabels.DOPA,
    legalDocumentTypeLabels.ROPA,
    legalDocumentTypeLabels.TOS,
    legalDocumentTypeLabels.PN,
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

    // The Terms of Service gate links here with ?tab=, so the reader lands on the document it named.
    it.each(['TOS', 'PN'] as const)('opens on the tab a ?tab=%s link names', async (type) => {
        await mockSessionWithTestData()
        mockPathname(`${Routes.legal}?tab=${type}`)

        renderWithProviders(<UserLegalTabs />)

        expect(screen.getByRole('tab', { name: legalDocumentTypeLabels[type] })).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('falls back to Study Agreements for a tab it does not know', async () => {
        await mockSessionWithTestData()
        mockPathname(`${Routes.legal}?tab=NOPE`)

        renderWithProviders(<UserLegalTabs />)

        expect(screen.getByRole('tab', { name: legalDocumentTypeLabels.SLA })).toHaveAttribute('aria-selected', 'true')
    })
})
