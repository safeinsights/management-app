import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { actionResult, faker, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { OrgParticipationAgreement } from './org-participation-agreement'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations, not mockResolvedValue: mockReset restores these but wipes a value set
        // afterwards.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const publishParticipationAgreement = async (orgId: string, type: 'DOPA' | 'ROPA', signedAt: string) => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(await createLegalDocumentDraftAction({ type, orgId, fileName: 'agreement.pdf' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

describe('OrgParticipationAgreement', () => {
    it('renders the empty state when nothing is on file', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'enclave',
            isAdmin: true,
        })

        renderWithProviders(<OrgParticipationAgreement orgSlug={org.slug} type="DOPA" />)

        await waitFor(() => expect(screen.getByText('No Data Organization Participation Agreement yet.')).toBeDefined())
        expect(screen.getByText('It will appear here once SafeInsights has countersigned it.')).toBeDefined()
    })

    it('shows the effective date and a PDF link for the org on file', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'enclave',
            isAdmin: true,
        })
        const version = await publishParticipationAgreement(org.id, 'DOPA', '2026-04-04')
        await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgParticipationAgreement orgSlug={org.slug} type="DOPA" />)

        await waitFor(() => expect(screen.getByText('Effective on: Apr 04, 2026')).toBeDefined())
        expect(screen.getByRole('link', { name: /PDF/ })).toHaveAttribute('href', `/dl/legal/${version.id}`)
    })

    it('titles the panel with the lab agreement name for a Research Lab', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'lab',
            isAdmin: true,
        })
        await publishParticipationAgreement(org.id, 'ROPA', '2026-05-05')
        await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'lab', isAdmin: true })

        renderWithProviders(<OrgParticipationAgreement orgSlug={org.slug} type="ROPA" />)

        // The heading comes from a prop and is on screen while the query loads, so waiting on it
        // would assert against the loader.
        await waitFor(() => expect(screen.getByText('Effective on: May 05, 2026')).toBeDefined())
        expect(screen.getByRole('heading', { name: 'Research Organization Participation Agreement' })).toBeDefined()
    })
})
