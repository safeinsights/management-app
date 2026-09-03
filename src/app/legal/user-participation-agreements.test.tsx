import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { actionResult, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { UserParticipationAgreements } from './user-participation-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const seedAcknowledgedAgreement = async (type: 'DOPA' | 'ROPA', signedAt: string) => {
    const orgType = type === 'DOPA' ? 'enclave' : 'lab'
    const { org, restoreSession } = await mockSessionWithTestData({ orgType })

    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type, orgId: org.id, fileName: 'agreement.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    restoreSession()
    actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

    return { org, version }
}

describe('UserParticipationAgreements', () => {
    it('shows the organization, the effective date and a PDF link for an acknowledged DOPA', async () => {
        const { org, version } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(org.name)).toBeDefined())
        const row = screen.getByText(org.name).closest('tr')
        if (!row) throw new Error('no row for the org')
        expect(within(row).getByText('Apr 04, 2026')).toBeDefined()
        expect(within(row).getByRole('link', { name: /PDF/ })).toHaveAttribute('href', `/dl/legal/${version.id}`)
    })

    it('does not show a DOPA on the ROPA tab', async () => {
        await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="ROPA" />)

        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Research Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
    })

    it('names the type in the empty state and the heading', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        expect(screen.getByRole('heading', { name: 'Data Organization Participation Agreement' })).toBeDefined()
        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Data Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
    })
})
